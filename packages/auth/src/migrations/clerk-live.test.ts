/**
 * Live Clerk migration E2E — runs against a real Clerk development instance's
 * API export. Requires `scripts/migration-e2e/clerk.ts pull` output at
 * `tmp/clerk-export/`. Skips cleanly when the export is absent (e.g. CI).
 *
 * Optional: `tmp/clerk-export/users.csv` from the dashboard
 * (Settings → User Exports → Export all users) carries `password_digest`
 * columns and enables the credential-carryover assertions.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "../component/_generated/api.js";
import schema from "../component/schema.js";
import {
  normalizeClerkExport,
  type ClerkApiUser,
  type ClerkCsvRow,
  type ClerkMembership,
  type ClerkOrganization,
  type ClerkOrganizationInvitation,
} from "./clerk.js";
import {
  hashPassword,
  shouldRehashAfterVerify,
  verifyPassword,
} from "../convex-runtime/native/password.js";

const EXPORT_DIR = resolve(__dirname, "../../../../tmp/clerk-export");
const hasExport = existsSync(resolve(EXPORT_DIR, "users.json"));
const hasCsv = existsSync(resolve(EXPORT_DIR, "users.csv"));

/** Must match PASSWORD in scripts/migration-e2e/clerk.ts — kept out of
 * seed-state.json so the on-disk state file carries no secrets. */
const SEED_PASSWORD = "Migration-Test-Password-1!";

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(EXPORT_DIR, name), "utf-8")) as T;
}

/** Minimal CSV reader — the dashboard export uses RFC-4180 quoting. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body.map((cells) => Object.fromEntries(header.map((key, i) => [key, cells[i] ?? ""])));
}

describe.skipIf(!hasExport)("clerk live export normalization", () => {
  let input: {
    users: ClerkApiUser[];
    organizations: ClerkOrganization[];
    memberships: ClerkMembership[];
    invitations: ClerkOrganizationInvitation[];
    csvRows?: ClerkCsvRow[];
  };
  let out: ReturnType<typeof normalizeClerkExport>;

  beforeAll(() => {
    input = {
      users: readJson<ClerkApiUser[]>("users.json"),
      organizations: readJson<ClerkOrganization[]>("organizations.json"),
      memberships: readJson<ClerkMembership[]>("memberships.json"),
      invitations: readJson<ClerkOrganizationInvitation[]>("invitations.json"),
      csvRows: hasCsv
        ? (parseCsv(readFileSync(resolve(EXPORT_DIR, "users.csv"), "utf-8")) as ClerkCsvRow[])
        : undefined,
    };
    out = normalizeClerkExport(input);
    writeFileSync(resolve(EXPORT_DIR, "normalized.json"), JSON.stringify(out, null, 2));
  });

  it("normalizes every non-banned user", () => {
    const banned = input.users.filter((u) => u.banned || u.locked);
    expect(out.users.length).toBe(input.users.length - banned.length);
    for (const user of out.users) {
      expect(user.email).toMatch(/^[^\s@]+@[^\s@]+$/);
    }
  });

  it("skips banned and locked users and their memberships", () => {
    const banned = input.users.filter((u) => u.banned || u.locked);
    for (const user of banned) {
      const memberIds = input.memberships
        .filter((m) => m.public_user_data?.user_id === user.id)
        .map((m) => m.id);
      for (const id of memberIds) {
        expect(out.skipped.some((s) => s.kind === "membership" && s.externalId === id)).toBe(true);
      }
    }
  });

  it("emits pending invitations as invited memberships", () => {
    const pending = input.invitations.filter(
      (i) => (i.status ?? "pending").toLowerCase() === "pending",
    );
    const invited = out.memberships.filter((m) => m.status === "invited");
    expect(invited.length).toBe(pending.length);
    for (const invitation of pending) {
      expect(invited.some((m) => m.userEmail === invitation.email_address?.toLowerCase())).toBe(
        true,
      );
    }
  });

  it("maps active memberships to active seats with stripped role keys", () => {
    const active = out.memberships.filter((m) => m.status !== "invited");
    expect(active.length).toBeGreaterThan(0);
    for (const member of active) {
      expect(member.roleKey).not.toMatch(/^org:/);
      expect(member.organizationSlug).toBeTruthy();
    }
  });

  it("carries bcrypt credentials only when the CSV export is present", () => {
    const credentialAccounts = out.accounts.filter((a) => a.passwordHash);
    if (hasCsv) {
      const skippedUserIds = new Set(
        out.skipped.filter((s) => s.kind === "user").map((s) => s.externalId),
      );
      const digests = (input.csvRows ?? []).filter(
        (r) => r.password_hasher === "bcrypt" && !skippedUserIds.has(r.id ?? ""),
      );
      expect(credentialAccounts.length).toBe(digests.length);
      for (const account of credentialAccounts) {
        expect(account.passwordHash).toMatch(/^\$2[aby]\$/);
      }
    } else {
      expect(credentialAccounts.length).toBe(0);
    }
  });

  it("verifies real Clerk digests against the seeded password", async () => {
    if (!hasCsv) return;
    const credentialAccounts = out.accounts.filter((a) => a.passwordHash);
    expect(credentialAccounts.length).toBeGreaterThan(0);
    for (const account of credentialAccounts) {
      expect(
        await verifyPassword(SEED_PASSWORD, account.passwordHash!),
        `${account.userEmail} digest should verify`,
      ).toBe(true);
      expect(await verifyPassword("wrong-password", account.passwordHash!)).toBe(false);
      expect(shouldRehashAfterVerify(account.passwordHash!)).toBe(true);
      const upgraded = await hashPassword(SEED_PASSWORD);
      expect(upgraded).toMatch(/^\$argon2id\$/);
      expect(await verifyPassword(SEED_PASSWORD, upgraded)).toBe(true);
      expect(shouldRehashAfterVerify(upgraded)).toBe(false);
    }
  });

  it("reports no unexpected skips", () => {
    const allowed = new Set([
      "user",
      "membership",
      "organization",
      "account",
      "credential",
      "session",
    ]);
    for (const skipped of out.skipped) {
      expect(allowed.has(skipped.kind)).toBe(true);
    }
    expect(out.skipped.filter((s) => s.kind === "user")).toEqual(
      input.users
        .filter((u) => u.banned || u.locked || !u.email_addresses?.length)
        .map((u) => expect.objectContaining({ externalId: u.id })),
    );
  });

  it("writes the normalized export into the component schema", async () => {
    const t = convexTest(schema, import.meta.glob("../component/**/*.*s"));

    const userIdByEmail = new Map<string, string>();
    const emailVerifiedByEmail = new Map<string, boolean>();
    for (const user of out.users) {
      emailVerifiedByEmail.set(user.email, user.emailVerified);
      const { userId } = await t.mutation(internal.migrate.migrateUser, {
        legacyUser: {
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          image: user.image ?? null,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      });
      userIdByEmail.set(user.email, userId);
    }
    expect(userIdByEmail.size).toBe(out.users.length);

    for (const account of out.accounts) {
      const userId = userIdByEmail.get(account.userEmail);
      expect(userId).toBeDefined();
      await t.mutation(internal.migrate.migrateAccount, {
        legacyAccount: {
          providerId: account.provider,
          issuer: account.issuer,
          accountId: account.subject,
          userId: userId!,
          password: account.passwordHash ?? null,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        },
        userId: userId!,
        email: account.userEmail,
        emailVerified: emailVerifiedByEmail.get(account.userEmail) ?? true,
      });
    }

    const orgIdBySlug = new Map<string, string>();
    for (const org of out.organizations) {
      const { organizationId, created } = await t.mutation(internal.migrate.migrateOrganization, {
        organization: org,
      });
      expect(created).toBe(true);
      orgIdBySlug.set(org.slug, organizationId);
      /* Second call is idempotent — the slug-keyed org already exists. */
      const repeat = await t.mutation(internal.migrate.migrateOrganization, {
        organization: org,
      });
      expect(repeat.created).toBe(false);
      expect(repeat.organizationId).toBe(organizationId);
    }

    for (const member of out.memberships) {
      const organizationId = orgIdBySlug.get(member.organizationSlug);
      expect(organizationId).toBeDefined();
      const result = await t.mutation(internal.migrate.migrateMembership, {
        organizationId: organizationId!,
        email: member.userEmail,
        roleKey: member.roleKey,
        status: member.status,
        createdAt: member.createdAt,
        updatedAt: member.updatedAt,
      });
      expect(result.roleId).toBeDefined();
    }

    /* Every organization carries its full normalized membership. */
    for (const org of out.organizations) {
      const expected = out.memberships.filter((m) => m.organizationSlug === org.slug);
      const members = await t.run(async (ctx) =>
        ctx.db
          .query("organization_members")
          .withIndex("by_organization", (q) => q.eq("organizationId", orgIdBySlug.get(org.slug)!))
          .take(50),
      );
      expect(members.length).toBe(expected.length);
      for (const member of expected) {
        const row = members.find(
          (m) =>
            (member.status === "invited" && m.invitedEmail === member.userEmail) ||
            (member.status !== "invited" && m.userId === userIdByEmail.get(member.userEmail)),
        );
        expect(row, `${member.userEmail} @${org.slug}`).toBeDefined();
        expect(row!.status).toBe(member.status === "invited" ? "invited" : "active");
      }
    }
  });
});
