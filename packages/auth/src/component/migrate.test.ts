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
    /* Migration-created roles start empty — an export must never mint `*`. */
    expect(adminRole?.permissions).toEqual([]);

    const secondRun = await t.mutation(internal.migrate.migrateMembership, {
      organizationId: orgIdBySlug.get("acme")!,
      email: "ada@example.com",
      roleKey: "admin",
      createdAt: 1700003000000,
      updatedAt: 1700003100000,
    });
    expect(secondRun.memberId).toBe(admin!._id);
  });

  it("refuses memberships into orgs without the migration marker unless opted in", async () => {
    const t = convexTest(schema, modules);
    const out = normalizeClerkExport(data);
    const ada = out.users.find((u) => u.email === "ada@example.com")!;
    await t.mutation(internal.migrate.migrateUser, {
      legacyUser: {
        name: ada.name,
        email: ada.email,
        emailVerified: ada.emailVerified,
        image: null,
        createdAt: ada.createdAt,
        updatedAt: ada.updatedAt,
      },
    });

    const preExisting = await t.run(async (ctx) =>
      ctx.db.insert("organizations", {
        name: "Tenant Inc",
        slug: "tenant",
        status: "active",
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      }),
    );

    const refused = await t.mutation(internal.migrate.migrateMembership, {
      organizationId: preExisting,
      email: "ada@example.com",
      roleKey: "owner",
      createdAt: 1700000100000,
      updatedAt: 1700000100000,
    });
    expect(refused.memberId).toBeUndefined();
    expect(refused.skipped).toContain("migration marker");

    const optedIn = await t.mutation(internal.migrate.migrateMembership, {
      organizationId: preExisting,
      email: "ada@example.com",
      roleKey: "owner",
      allowExistingOrg: true,
      createdAt: 1700000100000,
      updatedAt: 1700000100000,
    });
    expect(optedIn.memberId).toBeDefined();
    const optedInRole = await t.run(async (ctx) =>
      ctx.db.get("organization_roles", optedIn.roleId!),
    );
    expect(optedInRole?.key).toBe("owner");
    expect(optedInRole?.permissions).toEqual(["*"]);
  });

  it("promotes an invited membership to active when the user migrates later", async () => {
    const t = convexTest(schema, modules);
    const out = normalizeClerkExport(data);
    const org = out.organizations[0]!;

    const { organizationId } = await t.mutation(internal.migrate.migrateOrganization, {
      organization: org,
    });
    const invited = await t.mutation(internal.migrate.migrateMembership, {
      organizationId,
      email: "late@example.com",
      roleKey: "member",
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    });
    expect(invited.userFound).toBe(false);

    const { userId } = await t.mutation(internal.migrate.migrateUser, {
      legacyUser: {
        name: "Late Joiner",
        email: "late@example.com",
        emailVerified: false,
        image: null,
        createdAt: 1700000100000,
        updatedAt: 1700000100000,
      },
    });
    expect(userId).toBeDefined();

    const promoted = await t.mutation(internal.migrate.migrateMembership, {
      organizationId,
      email: "late@example.com",
      roleKey: "member",
      createdAt: 1700000200000,
      updatedAt: 1700000200000,
    });
    expect(promoted.memberId).toBe(invited.memberId);
    expect(promoted.userFound).toBe(true);

    const row = await t.run(async (ctx) => ctx.db.get("organization_members", promoted.memberId!));
    expect(row?.status).toBe("active");
    expect(row?.userId).toBe(userId);
    expect(row?.invitedEmail).toBeUndefined();

    const all = await t.run(async (ctx) =>
      ctx.db
        .query("organization_members")
        .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
        .take(50),
    );
    expect(all).toHaveLength(1);
  });
});
