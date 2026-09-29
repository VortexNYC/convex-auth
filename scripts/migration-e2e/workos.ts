#!/usr/bin/env node
/**
 * Live WorkOS migration-E2E helpers.
 *
 * Usage (from repo root, with packages/auth/.env.local sourced):
 *   pnpm tsx scripts/migration-e2e/workos.ts seed
 *   pnpm tsx scripts/migration-e2e/workos.ts pull
 *   pnpm tsx scripts/migration-e2e/workos.ts apply
 *   pnpm tsx scripts/migration-e2e/workos.ts verify
 *
 * `seed` populates a WorkOS sandbox environment (password user, unverified
 * user, external_id user, organization, admin/member memberships, pending
 * invitation). `pull` downloads users / organizations / memberships /
 * invitations into tmp/workos-export/ as real API-shaped JSON.
 *
 * WorkOS does not expose password digests via the API — hash export requires
 * a support ticket. Until then `verify` exercises the reset path: migrated
 * users land without credentials, reset, then sign in.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = resolve(ROOT, "tmp/workos-export");
const API = "https://api.workos.com";

let fileEnv: Record<string, string> | null = null;

function env(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  if (!fileEnv) {
    fileEnv = {};
    for (const candidate of [
      resolve(ROOT, "packages/auth/.env.local"),
      resolve(ROOT, ".env.local"),
      resolve(ROOT, "examples/server/.env.local"),
    ]) {
      try {
        for (const line of readFileSync(candidate, "utf-8").split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const match = trimmed.match(/^(?:export\s+)?([A-Z0-9_]+)=(.*)$/);
          if (!match || fileEnv[match[1]]) continue;
          let value = match[2].trim();
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          fileEnv[match[1]] = value;
        }
      } catch {
        /* file absent — keep looking */
      }
    }
  }
  return fileEnv[name];
}

function apiKey(): string {
  const key = env("WORKOS_API_KEY");
  if (!key) throw new Error("WORKOS_API_KEY not set — see packages/auth/.env.local");
  if (!key.startsWith("sk_test_")) {
    throw new Error(
      "WORKOS_API_KEY must be a test-environment key (sk_test_…) — this harness seeds and reads live data; refusing non-test credentials",
    );
  }
  return key;
}

async function workos(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `${init.method ?? "GET"} ${path} → ${response.status}: ${JSON.stringify(payload)}`,
    );
  }
  return payload;
}

/* Raw WorkOS responses use snake_case `list_metadata.after` as the
 * next-page cursor (the camelCase shape only exists inside their SDKs). */
type ListPage = { data: unknown[]; list_metadata?: { after?: string | null } };

async function listAll(path: string): Promise<unknown[]> {
  const out: unknown[] = [];
  let after: string | null = null;
  for (;;) {
    const sep = path.includes("?") ? "&" : "?";
    const cursor = after ? `&after=${encodeURIComponent(after)}` : "";
    const page = (await workos(`${path}${sep}limit=100${cursor}`)) as ListPage;
    out.push(...page.data);
    after = page.list_metadata?.after ?? null;
    if (!after || page.data.length < 100) return out;
  }
}

// ---- seed ----------------------------------------------------------------

const PASSWORD = "Migration-Test-Password-1!";

const SEED_USERS = [
  {
    key: "password",
    email: "ada.migration@example.com",
    body: { first_name: "Ada", last_name: "Migration", email_verified: true },
  },
  {
    key: "password2",
    email: "grace.migration@example.com",
    body: { first_name: "Grace", last_name: "Hopper", email_verified: true },
  },
  {
    key: "external-id",
    email: "edsger.migration@example.com",
    body: { first_name: "Edsger", external_id: "legacy-user-42", email_verified: true },
  },
  {
    key: "unverified",
    email: "katherine.migration@example.com",
    body: { first_name: "Katherine", email_verified: false },
  },
] as const;

async function findUserByEmail(email: string): Promise<{ id: string } | null> {
  const page = (await workos(
    `/user_management/users?email=${encodeURIComponent(email)}`,
  )) as ListPage;
  return (page.data[0] as { id: string } | undefined) ?? null;
}

async function seed(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const created: Record<string, string> = {};

  for (const entry of SEED_USERS) {
    const existing = await findUserByEmail(entry.email);
    if (existing) {
      created[entry.key] = existing.id;
      console.log(`user ${entry.key}: already exists ${existing.id}`);
      continue;
    }
    const user = (await workos("/user_management/users", {
      method: "POST",
      body: { email: entry.email, password: PASSWORD, ...entry.body },
    })) as { id: string };
    created[entry.key] = user.id;
    console.log(`user ${entry.key}: created ${user.id}`);
  }

  const orgs = await listAll("/organizations");
  let org = (orgs as { id: string; name: string }[]).find((o) => o.name === "Acme Migration");
  if (!org) {
    org = (await workos("/organizations", {
      method: "POST",
      body: { name: "Acme Migration" },
    })) as { id: string; name: string };
    console.log(`org created: ${org.id}`);
  } else {
    console.log(`org exists: ${org.id}`);
  }

  const memberships = [
    { user: "password", role: "admin" },
    { user: "password2", role: "member" },
    { user: "external-id", role: "member" },
    { user: "unverified", role: "member" },
  ] as const;
  const existing = (await listAll(
    `/user_management/organization_memberships?organization_id=${org.id}`,
  )) as { user_id: string }[];
  const memberUserIds = new Set(existing.map((m) => m.user_id));
  for (const m of memberships) {
    if (memberUserIds.has(created[m.user])) {
      console.log(`membership ${m.user}: already a member`);
      continue;
    }
    const result = await workos("/user_management/organization_memberships", {
      method: "POST",
      body: {
        user_id: created[m.user],
        organization_id: org.id,
        role_slug: m.role,
      },
    }).catch((e: Error) => {
      console.log(`membership ${m.user}: ${e.message}`);
      return null;
    });
    if (result) console.log(`membership ${m.user} → ${m.role}`);
  }

  const pendingInvitations = (await listAll(
    `/user_management/invitations?organization_id=${org.id}`,
  ).catch(() => [])) as { email: string; state?: string }[];
  const alreadyInvited = pendingInvitations.some(
    (i) =>
      i.email === "invited.migration@example.com" &&
      (i.state ?? "pending").toLowerCase() === "pending",
  );
  if (alreadyInvited) {
    console.log("invitation: invited.migration@example.com already pending");
  } else {
    const invitation = await workos("/user_management/invitations", {
      method: "POST",
      body: {
        email: "invited.migration@example.com",
        organization_id: org.id,
        role_slug: "member",
      },
    }).catch((e: Error) => console.log(`invitation: ${e.message}`));
    if (invitation) console.log("invitation sent: invited.migration@example.com");
  }

  writeFileSync(
    resolve(OUT_DIR, "seed-state.json"),
    JSON.stringify({ created, orgId: org.id }, null, 2),
  );
  console.log(`\nseed state → ${resolve(OUT_DIR, "seed-state.json")}`);
}

// ---- pull ----------------------------------------------------------------

async function pull(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const users = await listAll("/user_management/users");
  const organizations = await listAll("/organizations");
  console.log(`pulled ${users.length} users, ${organizations.length} organizations`);

  const memberships: unknown[] = [];
  const invitations: unknown[] = [];
  for (const org of organizations as { id: string }[]) {
    memberships.push(
      ...(await listAll(`/user_management/organization_memberships?organization_id=${org.id}`)),
    );
    invitations.push(
      ...(await listAll(`/user_management/invitations?organization_id=${org.id}`).catch(() => [])),
    );
  }
  console.log(`pulled ${memberships.length} memberships, ${invitations.length} invitations`);

  writeFileSync(resolve(OUT_DIR, "users.json"), JSON.stringify(users, null, 2));
  writeFileSync(resolve(OUT_DIR, "organizations.json"), JSON.stringify(organizations, null, 2));
  writeFileSync(resolve(OUT_DIR, "memberships.json"), JSON.stringify(memberships, null, 2));
  writeFileSync(resolve(OUT_DIR, "invitations.json"), JSON.stringify(invitations, null, 2));
  console.log(`export → ${OUT_DIR}`);
}

// ---- apply / verify ------------------------------------------------------

const SERVER_DIR = resolve(ROOT, "examples/server");

let warnedArgvFallback = false;

/** Calls a deployment function over HTTPS (`/api/function`) so secret-bearing
 * args (password digests, reset tokens) ride in the request body instead of
 * process argv. Component/internal functions need `CONVEX_DEPLOY_KEY` (dashboard
 * → deployment → generate deploy key); without it we fall back to `npx convex
 * run`, where args are briefly visible in `ps` on shared hosts. */
async function convexCall(fn: string, args: unknown, component?: string): Promise<unknown> {
  const deployKey = env("CONVEX_DEPLOY_KEY");
  const deploymentUrl = env("CONVEX_URL");
  if (!deploymentUrl) {
    throw new Error("CONVEX_URL not set — expected in examples/server/.env.local");
  }
  if (component && !deployKey) {
    if (!warnedArgvFallback) {
      warnedArgvFallback = true;
      console.warn(
        "CONVEX_DEPLOY_KEY unset — component calls fall back to `convex run` (args visible in process argv). Set it to use the authenticated HTTP path.",
      );
    }
    return convexRunCli(fn, args, component);
  }
  /* Public app functions ride the unauthenticated /api/action endpoint —
   * admin auth is never attached so a stale key can't break them.
   * Component/internal functions need /api/function + Convex deploy key. */
  const endpoint = component ? `${deploymentUrl}/api/function` : `${deploymentUrl}/api/action`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(component && deployKey ? { Authorization: `Convex ${deployKey}` } : {}),
    },
    body: JSON.stringify({
      path: fn,
      args,
      format: "convex_encoded_json",
      ...(component ? { componentPath: component } : {}),
    }),
  });
  const payload = (await response.json()) as {
    status?: string;
    value?: unknown;
    errorMessage?: string;
  };
  if (!response.ok && response.status !== 445) {
    throw new Error(`${fn} → HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  if (payload.status !== "success") {
    throw new Error(`${fn} failed: ${payload.errorMessage ?? JSON.stringify(payload)}`);
  }
  return payload.value;
}

function convexRunCli(fn: string, args: unknown, component: string): unknown {
  const argv = ["convex", "run", "--component", component, fn, JSON.stringify(args)];
  const stdout = execFileSync("npx", argv, {
    cwd: SERVER_DIR,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  return JSON.parse(stdout.trim());
}

type NormalizedUser = {
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: number;
  updatedAt: number;
};
type NormalizedAccount = {
  userEmail: string;
  provider: string;
  issuer: string;
  subject: string;
  passwordHash?: string;
  createdAt: number;
  updatedAt: number;
};
type NormalizedOrganization = { slug: string; name: string } & Record<string, unknown>;
type NormalizedMembership = {
  organizationSlug: string;
  userEmail: string;
  roleKey?: string;
  status?: "active" | "invited";
  createdAt: number;
  updatedAt: number;
};
type Normalized = {
  users: NormalizedUser[];
  accounts: NormalizedAccount[];
  organizations: NormalizedOrganization[];
  memberships: NormalizedMembership[];
  skipped: { kind: string; externalId: string; reason: string }[];
};

/** tmp/workos-export/normalized.json is written by the live vitest run. */
function loadNormalized(): Normalized {
  return JSON.parse(readFileSync(resolve(OUT_DIR, "normalized.json"), "utf-8")) as Normalized;
}

async function apply(): Promise<void> {
  const out = loadNormalized();
  console.log(
    `normalized: ${out.users.length} users, ${out.accounts.length} accounts, ` +
      `${out.organizations.length} orgs, ${out.memberships.length} memberships, ${out.skipped.length} skipped`,
  );

  const userIdByEmail = new Map<string, string>();
  const emailVerifiedByEmail = new Map<string, boolean>();
  for (const user of out.users) {
    emailVerifiedByEmail.set(user.email, user.emailVerified);
    const result = (await convexCall(
      "migrate:migrateUser",
      {
        legacyUser: {
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          image: user.image ?? null,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
      "convexAuth",
    )) as { userId: string };
    userIdByEmail.set(user.email, result.userId);
    console.log(`user ${user.email} → ${result.userId}`);
  }

  for (const account of out.accounts) {
    const userId = userIdByEmail.get(account.userEmail);
    if (!userId) {
      console.log(`account ${account.userEmail}: no migrated user — skipped`);
      continue;
    }
    await convexCall(
      "migrate:migrateAccount",
      {
        legacyAccount: {
          providerId: account.provider,
          issuer: account.issuer,
          accountId: account.subject,
          userId,
          password: account.passwordHash ?? null,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        },
        userId,
        email: account.userEmail,
        emailVerified: emailVerifiedByEmail.get(account.userEmail) ?? true,
      },
      "convexAuth",
    );
    console.log(`account ${account.userEmail} (${account.provider}) written`);
  }

  const orgIdBySlug = new Map<string, string>();
  for (const org of out.organizations) {
    const result = (await convexCall(
      "migrate:migrateOrganization",
      { organization: org },
      "convexAuth",
    )) as { organizationId: string; created: boolean };
    orgIdBySlug.set(org.slug, result.organizationId);
    console.log(
      `org ${org.slug} → ${result.organizationId} (${result.created ? "created" : "existing"})`,
    );
  }

  for (const member of out.memberships) {
    const organizationId = orgIdBySlug.get(member.organizationSlug);
    if (!organizationId) continue;
    const result = (await convexCall(
      "migrate:migrateMembership",
      {
        organizationId,
        email: member.userEmail,
        roleKey: member.roleKey,
        status: member.status,
        createdAt: member.createdAt,
        updatedAt: member.updatedAt,
      },
      "convexAuth",
    )) as { skipped?: string };
    console.log(
      `member ${member.userEmail}@${member.organizationSlug}` +
        (result.skipped ? ` — skipped: ${result.skipped}` : " written"),
    );
  }

  writeFileSync(
    resolve(OUT_DIR, "applied.json"),
    JSON.stringify(
      {
        userIdByEmail: Object.fromEntries(userIdByEmail),
        orgIdBySlug: Object.fromEntries(orgIdBySlug),
      },
      null,
      2,
    ),
  );
  console.log("\napplied → tmp/workos-export/applied.json");
}

async function verify(): Promise<void> {
  const applied = JSON.parse(readFileSync(resolve(OUT_DIR, "applied.json"), "utf-8")) as {
    userIdByEmail: Record<string, string>;
  };

  const email = "grace.migration@example.com";
  const userId = applied.userIdByEmail[email];
  if (!userId) throw new Error(`${email} not in applied.json — run apply first`);

  /* WorkOS exports carry no digests — imported users land on the reset path:
   * sendPasswordReset returns the token as emailId (the example's sendEmail
   * surfaces the extracted token), resetPassword sets a new argon2id
   * credential, then signIn proves the migrated account is live. */
  const reset = (await convexCall("auth:sendPasswordReset", { email })) as {
    status: string;
    emailId?: string;
  };
  if (reset.status !== "queued" || !reset.emailId) {
    /* emailId is the raw reset token — never stringify the whole response. */
    throw new Error(`password reset not issued (status: ${reset.status})`);
  }
  console.log(`reset token issued for ${email}`);

  const newPassword = "Migration-Reset-Password-9!";
  const changed = (await convexCall("auth:resetPassword", {
    token: reset.emailId,
    newPassword,
  })) as { status: boolean; reason?: string };
  if (!changed.status) {
    throw new Error(`resetPassword failed (reason: ${changed.reason ?? "unknown"})`);
  }
  console.log("password reset — argon2id credential installed");

  const session = (await convexCall("auth:signIn", { email, password: newPassword })) as {
    userId?: string;
    token?: string;
  };
  if (!session.userId || !session.token) {
    throw new Error(
      `post-reset sign-in failed (userId: ${session.userId ?? "none"}, token issued: ${Boolean(session.token)})`,
    );
  }
  console.log(`sign-in OK — userId ${session.userId}, token issued`);

  const account = (await convexCall(
    "native/accounts:getAccountBySubject",
    { provider: "password", issuer: "native", subject: userId },
    "convexAuth",
  )) as { credentialHash?: string } | null;
  const hash = account?.credentialHash ?? "";
  if (!hash.startsWith("$argon2id$")) {
    throw new Error(`expected argon2id credential, got: ${hash.slice(0, 20)}`);
  }
  console.log("reset-path credential is argon2id — WorkOS migration verified end-to-end");
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "seed") await seed();
  else if (command === "pull") await pull();
  else if (command === "apply") await apply();
  else if (command === "verify") await verify();
  else {
    console.error("usage: workos.ts seed|pull|apply|verify");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
