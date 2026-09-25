/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "./_generated/api.js";
import schema from "./schema.js";
import { normalizeClerkExport, type ClerkExportInput } from "../migrations/clerk.js";
import fixture from "../migrations/fixtures/clerk-export.json";

const modules = import.meta.glob("./**/*.*s");

const data = fixture as unknown as ClerkExportInput;

describe("cross-vendor migration writers", () => {
  it("writes a normalized Clerk export idempotently", async () => {
    const t = convexTest(schema, modules);
    const out = normalizeClerkExport(data);

    const userIdByEmail = new Map<string, string>();
    for (const user of out.users) {
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
    expect(userIdByEmail.size).toBe(4);

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
        emailVerified: true,
      });
    }

    const adaUserId = userIdByEmail.get("ada@example.com")!;
    const adaCred = await t.run(async (ctx) =>
      ctx.db
        .query("authAccounts")
        .withIndex("by_provider_issuer_subject", (q) =>
          q.eq("provider", "password").eq("issuer", "native").eq("subject", adaUserId),
        )
        .unique(),
    );
    expect(adaCred?.credentialHash).toMatch(/^\$2[abxy]\$/);

    const orgIdBySlug = new Map<string, string>();
    for (const org of out.organizations) {
      const { organizationId, created } = await t.mutation(internal.migrate.migrateOrganization, {
        organization: org,
      });
      expect(created).toBe(true);
      orgIdBySlug.set(org.slug, organizationId);
    }
    const repeat = await t.mutation(internal.migrate.migrateOrganization, {
      organization: out.organizations[0],
    });
    expect(repeat.created).toBe(false);
    expect(repeat.organizationId).toBe(orgIdBySlug.get("acme"));

    const roleCount = await t.run(async (ctx) =>
      ctx.db
        .query("organization_roles")
        .withIndex("by_organization", (q) => q.eq("organizationId", orgIdBySlug.get("acme")!))
        .take(50),
    );
    expect(roleCount.map((r) => r.key).sort()).toEqual(["member", "owner"]);

    for (const member of out.memberships) {
      const organizationId = orgIdBySlug.get(member.organizationSlug);
      expect(organizationId).toBeDefined();
      const result = await t.mutation(internal.migrate.migrateMembership, {
        organizationId: organizationId!,
        email: member.userEmail,
        roleKey: member.roleKey,
        createdAt: member.createdAt,
        updatedAt: member.updatedAt,
      });
      expect(result.roleId).toBeDefined();
    }

    const acmeMembers = await t.run(async (ctx) =>
      ctx.db
        .query("organization_members")
        .withIndex("by_organization", (q) => q.eq("organizationId", orgIdBySlug.get("acme")!))
        .take(50),
    );
    expect(acmeMembers).toHaveLength(3);

    const invited = acmeMembers.find((m) => m.status === "invited");
    expect(invited?.invitedEmail).toBe("newbie@example.com");
    expect(invited?.userId).toBeUndefined();

    const admin = acmeMembers.find((m) => m.userId === userIdByEmail.get("ada@example.com"));
    expect(admin?.status).toBe("active");
    const adminRole = await t.run(async (ctx) => ctx.db.get("organization_roles", admin!.roleId));
    expect(adminRole?.key).toBe("admin");
    expect(adminRole?.permissions).toEqual(["*"]);

    const secondRun = await t.mutation(internal.migrate.migrateMembership, {
      organizationId: orgIdBySlug.get("acme")!,
      email: "ada@example.com",
      roleKey: "admin",
      createdAt: 1700003000000,
      updatedAt: 1700003100000,
    });
    expect(secondRun.memberId).toBe(admin!._id);
  });
});
