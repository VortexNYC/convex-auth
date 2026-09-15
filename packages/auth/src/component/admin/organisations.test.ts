/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema.js";
import type { Id } from "../_generated/dataModel.js";
import {
  getOrganization,
  listMembers,
  listOrganizations,
  listRoles,
  removeMember,
  updateMemberRole,
} from "./organisations.js";

const modules = import.meta.glob("../**/*.*s");

async function insertUser(
  t: ReturnType<typeof convexTest>,
  email: string,
  name: string,
  isSuperAdmin = false,
): Promise<Id<"users">> {
  return (await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name,
      emailVerified: false,
      isActive: true,
      isSuperAdmin,
      createdAt: 0,
      updatedAt: 0,
    }),
  )) as Id<"users">;
}

async function insertOrganization(
  t: ReturnType<typeof convexTest>,
  name: string,
  slug: string,
  adminId: Id<"users">,
): Promise<Id<"organizations">> {
  return (await t.run((ctx) =>
    ctx.db.insert("organizations", {
      name,
      slug,
      imageUrl: undefined,
      status: "active",
      createdBy: adminId,
      metadataJson: undefined,
      createdAt: 0,
      updatedAt: 0,
    }),
  )) as Id<"organizations">;
}

async function insertRole(
  t: ReturnType<typeof convexTest>,
  organizationId: Id<"organizations">,
  key: string,
  name: string,
  adminId: Id<"users">,
): Promise<Id<"organization_roles">> {
  return (await t.run((ctx) =>
    ctx.db.insert("organization_roles", {
      organizationId,
      key,
      name,
      description: undefined,
      permissions: [],
      isSystem: false,
      createdBy: adminId,
      createdAt: 0,
      updatedAt: 0,
    }),
  )) as Id<"organization_roles">;
}

async function insertMember(
  t: ReturnType<typeof convexTest>,
  organizationId: Id<"organizations">,
  roleId: Id<"organization_roles">,
  userId?: Id<"users">,
): Promise<Id<"organization_members">> {
  return (await t.run((ctx) =>
    ctx.db.insert("organization_members", {
      organizationId,
      userId,
      roleId,
      status: "active",
      invitedEmail: undefined,
      invitedBy: undefined,
      assignedBy: undefined,
      invitedAt: undefined,
      acceptedAt: undefined,
      createdAt: 0,
      updatedAt: 0,
    }),
  )) as Id<"organization_members">;
}

describe("admin organisations", () => {
  it("lists organizations for a super admin", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    await insertOrganization(t, "Acme", "acme", adminId);

    const result = await t
      .withIdentity({ subject: adminId })
      .query(listOrganizations, { limit: 10 });

    expect(result.organizations).toHaveLength(1);
    expect(result.organizations[0].slug).toBe("acme");
  });

  it("rejects listOrganizations from a non-admin", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t, "user@example.com", "User");

    await expect(t.withIdentity({ subject: userId }).query(listOrganizations, {})).rejects.toThrow(
      "Forbidden: super admin required",
    );
  });

  it("gets an organization by id", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    const orgId = await insertOrganization(t, "Acme", "acme", adminId);

    const organization = await t
      .withIdentity({ subject: adminId })
      .query(getOrganization, { organizationId: orgId });

    expect(organization?.name).toBe("Acme");
  });

  it("lists members of an organization", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    const userId = await insertUser(t, "user@example.com", "User");
    const orgId = await insertOrganization(t, "Acme", "acme", adminId);
    const roleId = await insertRole(t, orgId, "member", "Member", adminId);
    await insertMember(t, orgId, roleId, userId);

    const result = await t
      .withIdentity({ subject: adminId })
      .query(listMembers, { organizationId: orgId, limit: 10 });

    expect(result.members).toHaveLength(1);
    expect(result.members[0].userId).toBe(userId);
  });

  it("lists roles of an organization", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    const orgId = await insertOrganization(t, "Acme", "acme", adminId);
    const memberRoleId = await insertRole(t, orgId, "member", "Member", adminId);
    const adminRoleId = await insertRole(t, orgId, "admin", "Admin", adminId);

    const result = await t
      .withIdentity({ subject: adminId })
      .query(listRoles, { organizationId: orgId });

    expect(result.roles).toHaveLength(2);
    expect(result.roles.map((r) => r._id)).toContain(adminRoleId);
    expect(result.roles.map((r) => r._id)).toContain(memberRoleId);
  });

  it("updates a member's role", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    const userId = await insertUser(t, "user@example.com", "User");
    const orgId = await insertOrganization(t, "Acme", "acme", adminId);
    const memberRoleId = await insertRole(t, orgId, "member", "Member", adminId);
    const adminRoleId = await insertRole(t, orgId, "admin", "Admin", adminId);
    const memberId = await insertMember(t, orgId, memberRoleId, userId);

    const result = await t
      .withIdentity({ subject: adminId })
      .mutation(updateMemberRole, { memberId, roleId: adminRoleId });
    expect(result.roleId).toBe(adminRoleId);

    const member = await t.run((ctx) => ctx.db.get("organization_members", memberId));
    expect(member?.roleId).toBe(adminRoleId);

    const audits = await t.run((ctx) =>
      ctx.db
        .query("auth_admin_audits")
        .withIndex("by_admin", (q) => q.eq("adminId", adminId))
        .take(1),
    );
    expect(audits[0]?.action).toBe("updateMemberRole");
  });

  it("removes a member from an organization", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    const userId = await insertUser(t, "user@example.com", "User");
    const orgId = await insertOrganization(t, "Acme", "acme", adminId);
    const roleId = await insertRole(t, orgId, "member", "Member", adminId);
    const memberId = await insertMember(t, orgId, roleId, userId);

    const result = await t.withIdentity({ subject: adminId }).mutation(removeMember, { memberId });
    expect(result.removed).toBe(true);

    const member = await t.run((ctx) => ctx.db.get("organization_members", memberId));
    expect(member).toBeNull();

    const audits = await t.run((ctx) =>
      ctx.db
        .query("auth_admin_audits")
        .withIndex("by_admin", (q) => q.eq("adminId", adminId))
        .take(1),
    );
    expect(audits[0]?.action).toBe("removeMember");
  });
});
