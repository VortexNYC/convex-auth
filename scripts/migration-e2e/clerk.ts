#!/usr/bin/env node
/**
 * Live Clerk migration-E2E helpers.
 *
 * Usage (from repo root, with packages/auth/.env.local sourced):
 *   pnpm tsx scripts/migration-e2e/clerk.ts seed
 *   pnpm tsx scripts/migration-e2e/clerk.ts pull
 *
 * `seed` populates the Clerk development instance with the same cases the
 * checked-in fixture models (password user, unverified-email user, banned
 * user, external_id user, organization, memberships, invitation).
 * `pull` downloads users / organizations / memberships / invitations as
 * real `ClerkApiExport`-shaped JSON into tmp/clerk-export/.
 *
 * Password digests are NOT in the API payload — they come only from the
 * dashboard CSV export (Settings → User Exports). The normalizer's csvRows
 * path is covered by supplying that file separately.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = resolve(ROOT, "tmp/clerk-export");
const API = "https://api.clerk.com/v1";

function loadEnv(): void {
  for (const candidate of [
    resolve(ROOT, "packages/auth/.env.local"),
    resolve(ROOT, ".env.local"),
  ]) {
    try {
      for (const line of readFileSync(candidate, "utf-8").split("\n")) {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
      }
    } catch {
      /* file absent — keep looking */
    }
  }
}

function secretKey(): string {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error("CLERK_SECRET_KEY not set — see packages/auth/.env.local");
  return key;
}

async function clerk(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
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

async function listAll(path: string): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = (await clerk(
      `${path}${path.includes("?") ? "&" : "?"}limit=100&offset=${offset}`,
    )) as unknown[] | { data: unknown[]; total_count?: number };
    const rows = Array.isArray(page) ? page : page.data;
    out.push(...rows);
    if (rows.length < 100) return out;
  }
}

// ---- seed ----------------------------------------------------------------

const PASSWORD = "Migration-Test-Password-1!";

type SeedUser = {
  key: string;
  email: string;
  extra?: Record<string, unknown>;
};

const SEED_USERS: SeedUser[] = [
  {
    key: "password",
    email: "ada.migration@example.com",
    extra: { first_name: "Ada", last_name: "Migration" },
  },
  {
    key: "password2",
    email: "grace.migration@example.com",
    extra: { first_name: "Grace", last_name: "Hopper" },
  },
  {
    key: "external-id",
    email: "edsger.migration@example.com",
    extra: { external_id: "legacy-user-42", first_name: "Edsger" },
  },
  {
    key: "username-ident",
    email: "katherine.migration@example.com",
    extra: { username: "kgjohnson", first_name: "Katherine" },
  },
  { key: "banned", email: "banned.migration@example.com", extra: { first_name: "Banned" } },
];

async function findUserByEmail(email: string): Promise<{ id: string } | null> {
  const users = (await clerk(`/users?email_address=${encodeURIComponent(email)}`)) as {
    id: string;
  }[];
  return users[0] ?? null;
}

async function seed(): Promise<void> {
  loadEnv();
  mkdirSync(OUT_DIR, { recursive: true });
  const created: Record<string, string> = {};

  for (const entry of SEED_USERS) {
    const existing = await findUserByEmail(entry.email);
    if (existing) {
      created[entry.key] = existing.id;
      console.log(`user ${entry.key}: already exists ${existing.id}`);
      continue;
    }
    const user = (await clerk("/users", {
      method: "POST",
      body: {
        email_address: [entry.email],
        password: PASSWORD,
        skip_password_checks: true,
        ...entry.extra,
      },
    })) as { id: string };
    created[entry.key] = user.id;
    console.log(`user ${entry.key}: created ${user.id}`);
  }

  // Banned user — ban AFTER creation so the account exists for the export.
  const bannedId = created["banned"];
  await clerk(`/users/${bannedId}/ban`, { method: "POST" }).catch((e: Error) => {
    if (!/already/i.test(e.message)) throw e;
  });
  console.log(`user banned: ${bannedId}`);

  // Unverified secondary email on the external-id user (verification matrix row).
  const emailAddress = (await clerk("/email_addresses", {
    method: "POST",
    body: {
      user_id: created["external-id"],
      email_address: "edsger.unverified@example.com",
      verified: false,
    },
  }).catch((e: Error) => {
    console.log(`secondary email: ${e.message}`);
    return null;
  })) as { id: string } | null;
  if (emailAddress) console.log(`unverified email added: ${emailAddress.id}`);

  // Organization + memberships.
  const orgs = (await clerk("/organizations?query=Acme%20Migration")) as { id: string }[];
  let orgId = orgs[0]?.id;
  if (!orgId) {
    const org = (await clerk("/organizations", {
      method: "POST",
      body: { name: "Acme Migration", created_by: created["password"] },
    })) as { id: string };
    orgId = org.id;
    console.log(`org created: ${orgId}`);
  } else {
    console.log(`org exists: ${orgId}`);
  }

  const memberships = [
    { user: "password", role: "org:admin" },
    { user: "password2", role: "org:member" },
    { user: "external-id", role: "org:member" },
    { user: "banned", role: "org:member" },
  ] as const;
  for (const m of memberships) {
    const result = await clerk(`/organizations/${orgId}/memberships`, {
      method: "POST",
      body: { user_id: created[m.user], role: m.role },
    }).catch((e: Error) => {
      console.log(`membership ${m.user}: ${e.message}`);
      return null;
    });
    if (result) console.log(`membership ${m.user} → ${m.role}`);
  }

  // Invitation for an email with no user account — exercises the invited path.
  const invitation = await clerk(`/organizations/${orgId}/invitations`, {
    method: "POST",
    body: { email_address: "invited.migration@example.com", role: "org:member" },
  }).catch((e: Error) => console.log(`invitation: ${e.message}`));
  if (invitation) console.log("invitation sent: invited.migration@example.com");

  writeFileSync(
    resolve(OUT_DIR, "seed-state.json"),
    JSON.stringify({ created, orgId, password: PASSWORD }, null, 2),
  );
  console.log(`\nseed state → ${resolve(ROOT, "tmp/clerk-export/seed-state.json")}`);
}

// ---- pull ----------------------------------------------------------------

async function pull(): Promise<void> {
  loadEnv();
  mkdirSync(OUT_DIR, { recursive: true });

  const users = await listAll("/users");
  const organizations = await listAll("/organizations");
  console.log(`pulled ${users.length} users, ${organizations.length} organizations`);

  const memberships: unknown[] = [];
  const invitations: unknown[] = [];
  for (const org of organizations as { id: string }[]) {
    memberships.push(...(await listAll(`/organizations/${org.id}/memberships`)));
    const inv = await listAll(`/organizations/${org.id}/invitations`).catch(() => []);
    invitations.push(...inv);
  }
  console.log(`pulled ${memberships.length} memberships, ${invitations.length} invitations`);

  writeFileSync(resolve(OUT_DIR, "users.json"), JSON.stringify(users, null, 2));
  writeFileSync(resolve(OUT_DIR, "organizations.json"), JSON.stringify(organizations, null, 2));
  writeFileSync(resolve(OUT_DIR, "memberships.json"), JSON.stringify(memberships, null, 2));
  writeFileSync(resolve(OUT_DIR, "invitations.json"), JSON.stringify(invitations, null, 2));
  console.log(`export → ${OUT_DIR}`);
  console.log(
    "\nNext: dashboard → Settings → User Exports → Export all users → save CSV to tmp/clerk-export/users.csv",
  );
}

// ---- apply / verify ------------------------------------------------------

const SERVER_DIR = resolve(ROOT, "examples/server");

/** `npx convex run` against the example app's configured deployment. */
function convexRun(fn: string, args: unknown, component?: string): unknown {
  const argv = ["convex", "run"];
  if (component) argv.push("--component", component);
  argv.push(fn, JSON.stringify(args));
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

/** `tmp/clerk-export/normalized.json` is written by the live vitest run —
 * normalization pulls argon2id-wasm transitively, which tsx cannot load,
 * so the wasm-capable vitest step materializes it as plain JSON here. */
function loadNormalized(): Normalized {
  return JSON.parse(readFileSync(resolve(OUT_DIR, "normalized.json"), "utf-8")) as Normalized;
}

async function apply(): Promise<void> {
  loadEnv();
  const out = loadNormalized();
  console.log(
    `normalized: ${out.users.length} users, ${out.accounts.length} accounts, ` +
      `${out.organizations.length} orgs, ${out.memberships.length} memberships, ${out.skipped.length} skipped`,
  );

  const userIdByEmail = new Map<string, string>();
  for (const user of out.users) {
    const result = convexRun(
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
    ) as { userId: string };
    userIdByEmail.set(user.email, result.userId);
    console.log(`user ${user.email} → ${result.userId}`);
  }

  for (const account of out.accounts) {
    const userId = userIdByEmail.get(account.userEmail);
    if (!userId) {
      console.log(`account ${account.userEmail}: no migrated user — skipped`);
      continue;
    }
    convexRun(
      "migrate:migrateAccount",
      {
        legacyAccount: {
          providerId: account.provider,
          accountId: account.subject,
          userId,
          password: account.passwordHash ?? null,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        },
        userId,
        email: account.userEmail,
        emailVerified: true,
      },
      "convexAuth",
    );
    console.log(`account ${account.userEmail} (${account.provider}) written`);
  }

  const orgIdBySlug = new Map<string, string>();
  for (const org of out.organizations) {
    const result = convexRun(
      "migrate:migrateOrganization",
      { organization: org },
      "convexAuth",
    ) as { organizationId: string; created: boolean };
    orgIdBySlug.set(org.slug, result.organizationId);
    console.log(
      `org ${org.slug} → ${result.organizationId} (${result.created ? "created" : "existing"})`,
    );
  }

  for (const member of out.memberships) {
    const organizationId = orgIdBySlug.get(member.organizationSlug);
    if (!organizationId) continue;
    const result = convexRun(
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
    ) as { skipped?: string };
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
  console.log("\napplied → tmp/clerk-export/applied.json");
}

async function verify(): Promise<void> {
  loadEnv();
  const seed = JSON.parse(readFileSync(resolve(OUT_DIR, "seed-state.json"), "utf-8")) as {
    password: string;
    created: Record<string, string>;
  };
  const applied = JSON.parse(readFileSync(resolve(OUT_DIR, "applied.json"), "utf-8")) as {
    userIdByEmail: Record<string, string>;
  };

  const email = "ada.migration@example.com";
  const userId = applied.userIdByEmail[email];
  if (!userId) throw new Error(`${email} not in applied.json — run apply first`);

  const before = convexRun(
    "native/accounts:getAccountBySubject",
    { provider: "password", issuer: "native", subject: userId },
    "convexAuth",
  ) as { credentialHash?: string } | null;
  console.log(`credential before sign-in: ${before?.credentialHash?.slice(0, 10)}…`);

  const session = convexRun("auth:signIn", { email, password: seed.password }) as {
    userId?: string;
    token?: string;
  };
  if (!session.userId || !session.token)
    throw new Error(`sign-in failed: ${JSON.stringify(session)}`);
  console.log(`sign-in OK — userId ${session.userId}, token issued`);

  const after = convexRun(
    "native/accounts:getAccountBySubject",
    { provider: "password", issuer: "native", subject: userId },
    "convexAuth",
  ) as { credentialHash?: string } | null;
  const hash = after?.credentialHash ?? "";
  console.log(`credential after sign-in:  ${hash.slice(0, 10)}…`);
  if (!hash.startsWith("$argon2id$")) {
    throw new Error(`expected lazy rehash to argon2id, got: ${hash.slice(0, 20)}`);
  }
  console.log("lazy rehash confirmed — bcrypt → argon2id");

  const again = convexRun("auth:signIn", { email, password: seed.password }) as { token?: string };
  if (!again.token) throw new Error("second sign-in after rehash failed");
  console.log("second sign-in OK — argon2id path verified end-to-end");
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "seed") await seed();
  else if (command === "pull") await pull();
  else if (command === "apply") await apply();
  else if (command === "verify") await verify();
  else {
    console.error("usage: clerk.ts seed|pull|apply|verify");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
