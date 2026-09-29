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

const sA = await signUp(userA, `org-owner-${stamp}`);
const sB = await signUp(userB, `org-invitee-${stamp}`);
const sC = await signUp(userC, `org-outsider-${stamp}`);
console.log("users signed in");

/* ---------- organizations + invitations ---------- */

const { organizationId } = await userA.mutation("organizations:createOrganization", {
  name: `Proof Org ${stamp}`,
  slug: `proof-${stamp}`,
});
expect(!!organizationId, `organization created (${organizationId})`);

const invite = await userA.mutation("organizations:inviteMember", {
  organizationId,
  email: "invitee@example.test",
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

// non-member cannot read
try {
  await userC.query("organizations:listMembers", { organizationId });
  expect(false, "non-member listed members");
} catch {
  expect(true, "non-member rejected from listMembers");
}

// role change: promote invitee to admin
await userA.mutation("organizations:setMemberRole", {
  organizationId,
  memberId: inviteeRow?._id ?? redeem.memberId,
  roleKey: "admin",
});
const after = await userA.query("organizations:listMembers", { organizationId });
const promoted = after.find((m) => m._id === inviteeRow?._id);
expect(promoted?.roleId !== inviteeRow?.roleId, "setMemberRole changed the invitee role");

/* ---------- API keys ---------- */

const issued = await userA.mutation("organizations:issueOrgApiKey", {
  organizationId,
  name: "ci-key",
  scopes: ["read"],
});
expect(
  !!issued.apiKey && !!issued.apiKeyId && issued.apiKey.startsWith(""),
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

/* ---------- MCP OAuth over real HTTP ---------- */

const ISSUER = SITE;
const REDIRECT_URI = "https://client.example/cb";

// dynamic client registration
const reg = await fetch(`${SITE}/oauth/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    client_name: `e2e-mcp-${stamp}`,
    redirect_uris: [REDIRECT_URI],
    scope: "openid email profile mcp",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  }),
});
const regBody = await reg.json();
expect(
  reg.status === 201 && !!regBody.client_id,
  `dynamic client registered (${regBody.client_id ?? reg.status})`,
);
const clientId = regBody.client_id;

// authorize: no session -> 401 login_required
const b64url = (b) =>
  b.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const verifier = b64url(randomBytes(32));
const challenge = b64url(createHash("sha256").update(verifier).digest());
const authorizeUrl = (orgId) => {
  const u = new URL(`${SITE}/oauth/authorize`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", REDIRECT_URI);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("state", "st-" + stamp);
  u.searchParams.set("scope", "openid email profile");
  if (orgId) u.searchParams.set("organization_id", orgId);
  return u.toString();
};

const noAuth = await fetch(authorizeUrl(organizationId), { redirect: "manual" });
expect(noAuth.status === 401, `authorize without session -> 401 (got ${noAuth.status})`);

// outsider (no org membership) -> access_denied 403
const outsiderAuth = await fetch(authorizeUrl(organizationId), {
  redirect: "manual",
  headers: { authorization: `Bearer ${sC.token}` },
});
expect(
  outsiderAuth.status === 403,
  `outsider org authorization denied (got ${outsiderAuth.status})`,
);

// real authorize for member — negative flow consumes its own code
const authorize = async () => {
  const resp = await fetch(authorizeUrl(organizationId), {
    redirect: "manual",
    headers: { authorization: `Bearer ${sA.token}` },
  });
  const loc = resp.headers.get("location") ?? "";
  const u = new URL(loc, REDIRECT_URI);
  return {
    status: resp.status,
    code: u.searchParams.get("code"),
    state: u.searchParams.get("state"),
  };
};

const badAuthz = await authorize();
expect(
  badAuthz.status === 302 && !!badAuthz.code,
  `authorize #1 -> 302 with code (${badAuthz.status})`,
);

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
expect(
  badExchange.status === 400,
  `wrong code_verifier rejected (${badExchange.status} ${badExchange.body.error})`,
);

const authz = await authorize();
expect(
  authz.status === 302 && !!authz.code && authz.state === `st-${stamp}`,
  `authorize #2 -> 302 with code + state (${authz.status})`,
);
const code = authz.code;

const exchange = await tokenForm({
  grant_type: "authorization_code",
  client_id: clientId,
  redirect_uri: REDIRECT_URI,
  code,
  code_verifier: verifier,
});
expect(
  exchange.status === 200 && !!exchange.body.access_token && !!exchange.body.refresh_token,
  `code exchange -> access+refresh (${exchange.status})`,
);

// code replay
const replay = await tokenForm({
  grant_type: "authorization_code",
  client_id: clientId,
  redirect_uri: REDIRECT_URI,
  code,
  code_verifier: verifier,
});
expect(replay.status === 400, `code replay rejected (${replay.status})`);

// verify access token against live JWKS (offline signature check)
const jwksResp = await fetch(`${SITE}/oauth/jwks`);
const jwks = await jwksResp.json();
const [h, p, s] = exchange.body.access_token.split(".");
const header = JSON.parse(Buffer.from(h, "base64url").toString());
const payloadJwt = JSON.parse(Buffer.from(p, "base64url").toString());
const jwk = jwks.keys.find((k) => k.kid === header.kid);
expect(!!jwk, `jwks exposes signing key kid=${header.kid}`);
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
  `access token claims correct (iss=${payloadJwt.iss} org=${payloadJwt.org_id})`,
);

// refresh grant
const refreshed = await tokenForm({
  grant_type: "refresh_token",
  client_id: clientId,
  refresh_token: exchange.body.refresh_token,
});
expect(
  refreshed.status === 200 && !!refreshed.body.access_token && !!refreshed.body.refresh_token,
  `refresh grant -> rotated tokens (${refreshed.status})`,
);

// old refresh token replay
const refreshReplay = await tokenForm({
  grant_type: "refresh_token",
  client_id: clientId,
  refresh_token: exchange.body.refresh_token,
});
expect(
  refreshReplay.status === 400,
  `old refresh token replay rejected (${refreshReplay.status} ${refreshReplay.body.error})`,
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
