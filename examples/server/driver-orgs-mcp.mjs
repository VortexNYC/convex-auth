import { ConvexHttpClient } from "convex/browser";
import { createHash, createPublicKey, randomBytes, verify as cryptoVerify } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const envPath = join(dirname(fileURLToPath(import.meta.url)), ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const URL_ = env.CONVEX_URL ?? process.env.CONVEX_URL;
const SITE = URL_.replace(".convex.cloud", ".convex.site");

let pass = 0;
let fail = 0;
const expect = (cond, msg) => {
  if (cond) {
    pass++;
    console.log("PASS:", msg);
  } else {
    fail++;
    console.log("FAIL:", msg);
  }
};

const userA = new ConvexHttpClient(URL_);
const userB = new ConvexHttpClient(URL_);
const userC = new ConvexHttpClient(URL_);
const userD = new ConvexHttpClient(URL_);
const stamp = Date.now().toString(36);

const signUp = async (client, username) => {
  try {
    await client.action("auth:signUpUsername", {
      username,
      password: "Driver-Pass-1234!",
    });
  } catch {
    /* exists already — sign in */
  }
  const s = await client.action("auth:signInUsername", {
    username,
    password: "Driver-Pass-1234!",
  });
  client.setAuth(s.token);
  return s;
};

/* B and D sign up with email+password so their accounts carry a real email —
 * invitation redemption binds invite.email to the accepting account's email. */
const signUpEmail = async (client, email) => {
  try {
    await client.action("auth:signUp", {
      email,
      password: "Driver-Pass-1234!",
      name: email.split("@")[0],
    });
  } catch {
    /* exists already — sign in */
  }
  const s = await client.action("auth:signIn", {
    email,
    password: "Driver-Pass-1234!",
  });
  client.setAuth(s.token);
  return s;
};

const sA = await signUp(userA, `org-owner-${stamp}`);
const emailB = `invitee-${stamp}@example.test`;
const emailD = `member2-${stamp}@example.test`;
const sB = await signUpEmail(userB, emailB);
const sC = await signUp(userC, `org-outsider-${stamp}`);
const sD = await signUpEmail(userD, emailD);
console.log("users signed in");

const expectReject = async (client, fn, args, label, fragment) => {
  try {
    await client.mutation(fn, args);
    expect(false, `${label} was allowed`);
  } catch (e) {
    expect(
      fragment === undefined || String(e.message).includes(fragment),
      `${label} rejected${fragment ? ` (${fragment})` : ""}`,
    );
  }
};

/* ---------- organizations + invitations ---------- */

const { organizationId } = await userA.mutation("organizations:createOrganization", {
  name: `Proof Org ${stamp}`,
  slug: `proof-${stamp}`,
});
expect(!!organizationId, `organization created (${organizationId})`);

// slug collision: an existing org must not be re-creatable (would seed the
// caller as owner of someone else's org)
await expectReject(
  userC,
  "organizations:createOrganization",
  { name: "Hijack Org", slug: `proof-${stamp}` },
  "outsider re-create org via slug collision",
  "slug already taken",
);

const invite = await userA.mutation("organizations:inviteMember", {
  organizationId,
  email: emailB,
});
expect(!!invite.token && !!invite.invitationId, "invitation issued with plaintext token");

const redeem = await userB.mutation("organizations:acceptInvitation", {
  token: invite.token,
});
expect(redeem.accepted === true && !!redeem.memberId, "invitation redeemed by invitee");

// token replay must not re-accept (component returns accepted:false or throws)
const replayInvite = await userB
  .mutation("organizations:acceptInvitation", { token: invite.token })
  .catch(() => ({ accepted: false, memberId: "" }));
expect(replayInvite.accepted === false, "invitation token replay rejected");

const members = await userA.query("organizations:listMembers", { organizationId });
expect(
  members.length === 2 && members.every((m) => m.status === "active"),
  `org has 2 active members (got ${members.length})`,
);
const inviteeRow = members.find((m) => m.userId === sB.user.id);
expect(!!inviteeRow, "invitee appears in member list");

// member-tier read IS allowed (organization:members:read)
const bMembers = await userB.query("organizations:listMembers", { organizationId });
expect(bMembers.length === 2, "member can listMembers (members:read)");

// non-member cannot read
try {
  await userC.query("organizations:listMembers", { organizationId });
  expect(false, "non-member listed members");
} catch {
  expect(true, "non-member rejected from listMembers");
}

// member-as-attacker negatives (B is still "member" tier here)
const ownerRow = members.find((m) => m.userId === sA.user.id);
await expectReject(
  userB,
  "organizations:setMemberRole",
  { organizationId, memberId: ownerRow?._id, roleKey: "viewer" },
  "member demote the owner",
  "Missing permission",
);
await expectReject(
  userB,
  "organizations:inviteMember",
  { organizationId, email: "sneaky@example.test", roleKey: "owner" },
  "member invite as owner",
  "Missing permission",
);
await expectReject(
  userB,
  "organizations:issueOrgApiKey",
  { organizationId, name: "rogue-key" },
  "member mint an org api key",
  "Missing permission",
);

// role change: promote invitee to admin
await userA.mutation("organizations:setMemberRole", {
  organizationId,
  memberId: inviteeRow?._id ?? redeem.memberId,
  roleKey: "admin",
});
const after = await userA.query("organizations:listMembers", { organizationId });
const promoted = after.find((m) => m._id === inviteeRow?._id);
expect(promoted?.roleId !== inviteeRow?.roleId, "setMemberRole changed the invitee role");

// admin-tier negatives: members:manage/invitations:manage do NOT unlock the
// owner role — assigning or stripping `*` requires holding `*`
await expectReject(
  userB,
  "organizations:setMemberRole",
  { organizationId, memberId: inviteeRow?._id, roleKey: "owner" },
  "admin self-promote to owner",
  "more privileged",
);
await expectReject(
  userB,
  "organizations:inviteMember",
  { organizationId, email: "sneaky2@example.test", roleKey: "owner" },
  "admin invite as owner",
  "more privileged",
);
await expectReject(
  userB,
  "organizations:setMemberRole",
  { organizationId, memberId: ownerRow?._id, roleKey: "viewer" },
  "admin demote the owner",
  "more privileged",
);
// but admin CAN do its actual job: invite a plain member
const inviteD = await userB.mutation("organizations:inviteMember", {
  organizationId,
  email: emailD,
});
expect(!!inviteD.token, "admin can invite a member-tier invitee");
const redeemD = await userD.mutation("organizations:acceptInvitation", {
  token: inviteD.token,
});
expect(redeemD.accepted === true, "second member joined via admin invite");

// email binding: a token addressed to a different email cannot be redeemed
// by this account, even though the token itself is valid
const ghostInvite = await userA.mutation("organizations:inviteMember", {
  organizationId,
  email: `ghost-${stamp}@example.test`,
});
await expectReject(
  userD,
  "organizations:acceptInvitation",
  { token: ghostInvite.token },
  "redeem invitation addressed to another email",
  "different account",
);

// owner-tier positives: the owner CAN grant and strip `*` — the ceiling is
// a coverage rule, not a freeze on the owner role (assert actual roleIds)
await userA.mutation("organizations:setMemberRole", {
  organizationId,
  memberId: inviteeRow?._id,
  roleKey: "owner",
});
const asOwner = (await userA.query("organizations:listMembers", { organizationId })).find(
  (m) => m._id === inviteeRow?._id,
);
expect(
  asOwner?.roleId !== promoted?.roleId && asOwner?.roleId !== inviteeRow?.roleId,
  "owner promoted admin to owner (roleId actually changed)",
);
await userA.mutation("organizations:setMemberRole", {
  organizationId,
  memberId: inviteeRow?._id,
  roleKey: "member",
});
const backToMember = (await userA.query("organizations:listMembers", { organizationId })).find(
  (m) => m._id === inviteeRow?._id,
);
expect(
  backToMember?.roleId === inviteeRow?.roleId,
  "owner demoted owner back to member (member roleId restored)",
);

// last-owner guard: the sole remaining `*` holder cannot be demoted
await expectReject(
  userA,
  "organizations:setMemberRole",
  { organizationId, memberId: ownerRow?._id, roleKey: "viewer" },
  "demote the last owner",
  "last owner",
);

// username-only accounts carry no email — they cannot redeem email-bound invites
await expectReject(
  userC,
  "organizations:acceptInvitation",
  { token: ghostInvite.token },
  "account without email redeems invite",
);

/* ---------- API keys ---------- */

// scope vocabulary ceiling — even the owner cannot mint unknown scopes
await expectReject(
  userA,
  "organizations:issueOrgApiKey",
  { organizationId, name: "bad-scope-key", scopes: ["root:all"] },
  "issue key with out-of-vocabulary scope",
  "Unknown API key scope",
);

const issued = await userA.mutation("organizations:issueOrgApiKey", {
  organizationId,
  name: "ci-key",
  scopes: ["read"],
});
expect(
  !!issued.apiKey && !!issued.apiKeyId && issued.apiKey.startsWith(issued.keyPrefix),
  `api key issued (prefix ${issued.keyPrefix})`,
);

const vRead = await userA.mutation("organizations:verifyApiKey", {
  presentedKey: issued.apiKey,
  requiredScopes: ["read"],
});
expect(
  vRead.valid === true && vRead.organizationId === organizationId,
  "api key verifies with required scope + org binding",
);

const vWrite = await userA.mutation("organizations:verifyApiKey", {
  presentedKey: issued.apiKey,
  requiredScopes: ["write"],
});
expect(
  vWrite.valid === false && vWrite.reason === "scope_missing",
  `scope_missing enforced (got ${vWrite.reason})`,
);

const vGarbage = await userA.mutation("organizations:verifyApiKey", {
  presentedKey: "sk-not-a-real-key",
});
expect(vGarbage.valid === false, `garbage key rejected (${vGarbage.reason})`);

// cross-tenant oracle: outsider presenting the real key learns nothing —
// every verdict collapses to not_found, including failures that would leak
// key state (scope_missing, revoked) to a member caller
const outsiderVerdict = await userC.mutation("organizations:verifyApiKey", {
  presentedKey: issued.apiKey,
});
expect(
  outsiderVerdict.valid === false && outsiderVerdict.reason === "not_found",
  `outsider cannot probe a real key (got ${outsiderVerdict.reason})`,
);
const outsiderScoped = await userC.mutation("organizations:verifyApiKey", {
  presentedKey: issued.apiKey,
  requiredScopes: ["write"],
});
expect(
  outsiderScoped.valid === false && outsiderScoped.reason === "not_found",
  `outsider gets not_found, not scope_missing (got ${outsiderScoped.reason})`,
);
// in-tenant oracle: a plain member (no api-keys:manage) also gets not_found
const memberVerdict = await userB.mutation("organizations:verifyApiKey", {
  presentedKey: issued.apiKey,
});
expect(
  memberVerdict.valid === false && memberVerdict.reason === "not_found",
  `member cannot probe a real key either (got ${memberVerdict.reason})`,
);

await userA.mutation("organizations:revokeApiKey", {
  organizationId,
  apiKeyId: issued.apiKeyId,
});
const vRevoked = await userA.mutation("organizations:verifyApiKey", {
  presentedKey: issued.apiKey,
});
expect(
  vRevoked.valid === false && vRevoked.reason === "revoked",
  `revoked key fails closed (${vRevoked.reason})`,
);
const outsiderRevoked = await userC.mutation("organizations:verifyApiKey", {
  presentedKey: issued.apiKey,
});
expect(
  outsiderRevoked.valid === false && outsiderRevoked.reason === "not_found",
  `outsider gets not_found, not revoked (got ${outsiderRevoked.reason})`,
);

/* ---------- MCP OAuth over real HTTP ---------- */

const ISSUER = SITE;
const REDIRECT_URI = "https://client.example/cb";

// dynamic client registration — scope includes mcp:admin so requests for it
// reach the authorize policy (client allowlist ∩ supported scopes)
const reg = await fetch(`${SITE}/oauth/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    client_name: `e2e-mcp-${stamp}`,
    redirect_uris: [REDIRECT_URI],
    scope: "openid email profile mcp mcp:admin",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  }),
});
const regBody = await reg.json();
expect(reg.status === 201 && !!regBody.client_id, "dynamic client registered");
const clientId = regBody.client_id;

const b64url = (b) =>
  b.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

/* Each authorize call gets a fresh PKCE pair; the returned verifier feeds the
 * matching token exchange (codes burn on presentation, so negatives need
 * fresh codes). */
const authorizeFor = async (
  token,
  { orgId = organizationId, scope = "openid email profile" } = {},
) => {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const u = new URL(`${SITE}/oauth/authorize`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", REDIRECT_URI);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("state", "st-" + stamp);
  u.searchParams.set("scope", scope);
  if (orgId) u.searchParams.set("organization_id", orgId);
  const resp = await fetch(u, {
    redirect: "manual",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const loc = resp.headers.get("location") ?? "";
  const parsed = loc ? new URL(loc, REDIRECT_URI) : null;
  return {
    status: resp.status,
    code: parsed?.searchParams.get("code"),
    state: parsed?.searchParams.get("state"),
    verifier,
    body: resp.status >= 400 ? await resp.json().catch(() => null) : null,
  };
};

// authorize: no session -> 401 login_required
const noAuth = await authorizeFor(null);
expect(noAuth.status === 401, "authorize without session -> 401");

// outsider (no org membership) -> access_denied 403
const outsiderAuth = await authorizeFor(sC.token);
expect(outsiderAuth.status === 403, "outsider org authorization denied");

/* Ambiguity rule: a user with multiple memberships must pass
 * organization_id explicitly. Owner A creates a second org first. */
await userA.mutation("organizations:createOrganization", {
  name: `Proof Org Two ${stamp}`,
  slug: `proof2-${stamp}`,
});
const ambiguous = await authorizeFor(sA.token, { orgId: null });
expect(
  ambiguous.status === 400 && ambiguous.body?.error === "invalid_request",
  "multi-org authorize without organization_id -> 400",
);

// single-membership user can omit organization_id — auto-selects their org
const autoSel = await authorizeFor(sD.token, { orgId: null });
expect(autoSel.status === 302 && !!autoSel.code, "single-membership authorize auto-selects org");

// scope ceiling: member role lacks organization:members:manage -> mcp:admin denied
const deniedScope = await authorizeFor(sD.token, { scope: "openid mcp:admin" });
expect(
  deniedScope.status === 403 && deniedScope.body?.error === "insufficient_scope",
  "member requesting mcp:admin -> 403 insufficient_scope",
);

// owner (`*`) CAN be granted mcp:admin — proves the ceiling is role-driven
const ownerAdmin = await authorizeFor(sA.token, { scope: "openid mcp:admin" });
expect(ownerAdmin.status === 302 && !!ownerAdmin.code, "owner requesting mcp:admin granted");

// real authorize for member — negative flow consumes its own code
const badAuthz = await authorizeFor(sA.token);
expect(badAuthz.status === 302 && !!badAuthz.code, "authorize #1 -> 302 with code");

// code exchange
const tokenForm = (fields) =>
  fetch(`${SITE}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  }).then((r) => r.json().then((b) => ({ status: r.status, body: b })));

// wrong verifier against code1 (negative) — component consumes codes on
// presentation, so the good exchange below uses a fresh code
const badExchange = await tokenForm({
  grant_type: "authorization_code",
  client_id: clientId,
  redirect_uri: REDIRECT_URI,
  code: badAuthz.code,
  code_verifier: "wrong-verifier",
});
expect(badExchange.status === 400, "wrong code_verifier rejected (400)");

const authz = await authorizeFor(sA.token);
expect(
  authz.status === 302 && !!authz.code && authz.state === `st-${stamp}`,
  "authorize #2 -> 302 with code + state",
);
const code = authz.code;

const exchange = await tokenForm({
  grant_type: "authorization_code",
  client_id: clientId,
  redirect_uri: REDIRECT_URI,
  code,
  code_verifier: authz.verifier,
});
expect(
  exchange.status === 200 && !!exchange.body.access_token && !!exchange.body.refresh_token,
  "code exchange -> access+refresh",
);

// code replay
const replay = await tokenForm({
  grant_type: "authorization_code",
  client_id: clientId,
  redirect_uri: REDIRECT_URI,
  code,
  code_verifier: authz.verifier,
});
expect(replay.status === 400, "code replay rejected");

// verify access token against live JWKS (offline signature check)
const jwksResp = await fetch(`${SITE}/oauth/jwks`);
const jwks = await jwksResp.json();
const [h, p, s] = exchange.body.access_token.split(".");
const header = JSON.parse(Buffer.from(h, "base64url").toString());
const payloadJwt = JSON.parse(Buffer.from(p, "base64url").toString());
const jwk = jwks.keys.find((k) => k.kid === header.kid);
expect(!!jwk, "jwks exposes signing key kid");
if (jwk) {
  const key = createPublicKey({ key: jwk, format: "jwk" });
  const okSig = cryptoVerify(
    "sha256",
    Buffer.from(`${h}.${p}`),
    { key, dsaEncoding: "ieee-p1363" },
    Buffer.from(s, "base64url"),
  );
  expect(okSig, "access token ES256 signature verifies against live JWKS");
}
expect(
  payloadJwt.iss === ISSUER &&
    payloadJwt.sub === sA.user.id &&
    payloadJwt.org_id === organizationId &&
    (payloadJwt.scope ?? "").includes("openid"),
  "access token claims correct (iss + org bound)",
);

// refresh grant
const refreshed = await tokenForm({
  grant_type: "refresh_token",
  client_id: clientId,
  refresh_token: exchange.body.refresh_token,
});
expect(
  refreshed.status === 200 && !!refreshed.body.access_token && !!refreshed.body.refresh_token,
  "refresh grant -> rotated tokens",
);

// old refresh token replay
const refreshReplay = await tokenForm({
  grant_type: "refresh_token",
  client_id: clientId,
  refresh_token: exchange.body.refresh_token,
});
expect(refreshReplay.status === 400, "old refresh token replay rejected (400)");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
