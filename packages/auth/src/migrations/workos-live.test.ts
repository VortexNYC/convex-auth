/**
 * Live WorkOS migration E2E — runs against a real WorkOS sandbox API pull.
 * Requires `scripts/migration-e2e/workos.ts pull` output at
 * `tmp/workos-export/`. Skips cleanly when the export is absent (e.g. CI).
 *
 * WorkOS never exposes password digests via the API — `password_hash` only
 * appears on a support-provided export. Without it, migrated users carry no
 * credential and land on the reset path; that is the behavior asserted here.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "../component/_generated/api.js";
import schema from "../component/schema.js";
import {
  normalizeWorkosExport,
  type WorkosInvitation,
  type WorkosMembership,
  type WorkosOrganization,
  type WorkosUser,
} from "./workos.js";

const EXPORT_DIR = resolve(__dirname, "../../../../tmp/workos-export");
const hasExport = existsSync(resolve(EXPORT_DIR, "users.json"));

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(EXPORT_DIR, name), "utf-8")) as T;
}

describe.skipIf(!hasExport)("workos live export normalization", () => {
  let input: {
    users: WorkosUser[];
    organizations: WorkosOrganization[];
    memberships: WorkosMembership[];
    invitations: WorkosInvitation[];
  };
  let out: ReturnType<typeof normalizeWorkosExport>;

  beforeAll(() => {
    input = {
      users: readJson<WorkosUser[]>("users.json"),
      organizations: readJson<WorkosOrganization[]>("organizations.json"),
      memberships: readJson<WorkosMembership[]>("memberships.json"),
      invitations: readJson<WorkosInvitation[]>("invitations.json"),
    };
    out = normalizeWorkosExport(input);
    writeFileSync(resolve(EXPORT_DIR, "normalized.json"), JSON.stringify(out, null, 2));
  });

  it("normalizes every user with an email", () => {
    const emailless = input.users.filter((u) => !u.email?.trim());
    expect(out.users.length).toBe(input.users.length - emailless.length);
    for (const user of out.users) {
      expect(user.email).toMatch(/^[^\s@]+@[^\s@]+$/);
    }
  });

  it("carries no credential accounts — WorkOS API exports have no digests", () => {
    const withHash = input.users.filter((u) => u.password_hash);
    const credentialAccounts = out.accounts.filter((a) => a.passwordHash);
    expect(credentialAccounts.length).toBe(withHash.length);
  });

  it("derives organization slugs from names", () => {
    for (const org of out.organizations) {
      expect(org.slug).toMatch(/^[a-z0-9-]+$/);
    }
    expect(new Set(out.organizations.map((o) => o.slug)).size).toBe(out.organizations.length);
  });

  it("emits pending invitations as invited memberships", () => {
    const pending = input.invitations.filter(
      (i) => (i.state ?? i.status ?? "pending").toLowerCase() === "pending",
    );
    const invited = out.memberships.filter((m) => m.status === "invited");
    expect(invited.length).toBe(pending.length);
    for (const invitation of pending) {
      expect(invited.some((m) => m.userEmail === invitation.email?.toLowerCase())).toBe(true);
    }
  });

  it("maps active memberships to active seats", () => {
    const active = out.memberships.filter((m) => m.status === "active");
    for (const member of active) {
      expect(member.userExternalId).toBeTruthy();
      expect(member.organizationSlug).toBeTruthy();
    }
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
      const repeat = await t.mutation(internal.migrate.migrateOrganization, {
        organization: org,
      });
      expect(repeat.created).toBe(false);
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

    for (const org of out.organizations) {
      const expected = out.memberships.filter((m) => m.organizationSlug === org.slug);
      const members = await t.run(async (ctx) =>
        ctx.db
          .query("organization_members")
          .withIndex("by_organization", (q) => q.eq("organizationId", orgIdBySlug.get(org.slug)!))
          .take(50),
      );
      expect(members.length).toBe(expected.length);
    }
  });
});
