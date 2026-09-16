import { paginator } from "convex-helpers/server/pagination";
import { query, mutation } from "../_generated/server.js";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel.js";
import { createAdminAudit, requireSuperAdmin } from "../../convex-runtime/admin/admin.js";
import schema from "../schema.js";
import {
  organizationMemberStatusValidator,
  organizationStatusValidator,
} from "../schema/validators.js";

const MAX_PAGE_LIMIT = 100;

type AdminOrganizationListItem = Pick<
  Doc<"organizations">,
  "_id" | "name" | "slug" | "imageUrl" | "status" | "createdBy" | "createdAt" | "updatedAt"
>;

const adminOrganizationValidator = v.object({
  _id: v.id("organizations"),
  name: v.string(),
  slug: v.string(),
  imageUrl: v.optional(v.string()),
  status: organizationStatusValidator,
  createdBy: v.optional(v.id("users")),
  createdAt: v.number(),
  updatedAt: v.number(),
});

type AdminMemberListItem = Pick<
  Doc<"organization_members">,
  | "_id"
  | "organizationId"
  | "userId"
  | "roleId"
  | "status"
  | "invitedEmail"
  | "createdAt"
  | "updatedAt"
>;

const adminMemberValidator = v.object({
  _id: v.id("organization_members"),
  organizationId: v.id("organizations"),
  userId: v.optional(v.id("users")),
  roleId: v.id("organization_roles"),
  status: organizationMemberStatusValidator,
  invitedEmail: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

type AdminRoleListItem = Pick<
  Doc<"organization_roles">,
  | "_id"
  | "organizationId"
  | "key"
  | "name"
  | "description"
  | "permissions"
  | "isSystem"
  | "createdBy"
  | "createdAt"
  | "updatedAt"
>;

const adminRoleValidator = v.object({
  _id: v.id("organization_roles"),
  organizationId: v.id("organizations"),
  key: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  permissions: v.array(v.string()),
  isSystem: v.boolean(),
  createdBy: v.optional(v.id("users")),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const listOrganizations = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
    endCursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({
    organizations: v.array(adminOrganizationValidator),
    nextCursor: v.optional(v.string()),
    hasNextPage: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    organizations: AdminOrganizationListItem[];
    nextCursor?: string;
    hasNextPage: boolean;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    await requireSuperAdmin(ctx, identity.subject);

    const limit = Math.min(args.limit ?? 20, MAX_PAGE_LIMIT);
    const { page, continueCursor, isDone } = await paginator(ctx.db, schema)
      .query("organizations")
      .order("desc")
      .paginate({ cursor: args.cursor ?? null, numItems: limit, endCursor: args.endCursor });

    const organizations: AdminOrganizationListItem[] = page.map((organization) => ({
      _id: organization._id,
      name: organization.name,
      slug: organization.slug,
      imageUrl: organization.imageUrl,
      status: organization.status,
      createdBy: organization.createdBy,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
    }));

    return {
      organizations,
      nextCursor: continueCursor,
      hasNextPage: !isDone,
    };
  },
});

export const getOrganization = query({
  args: { organizationId: v.id("organizations") },
  returns: v.union(adminOrganizationValidator, v.null()),
  handler: async (ctx, args): Promise<AdminOrganizationListItem | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    await requireSuperAdmin(ctx, identity.subject);

    const organization = await ctx.db.get("organizations", args.organizationId);
    if (organization === null) {
      return null;
    }
    return {
      _id: organization._id,
      name: organization.name,
      slug: organization.slug,
      imageUrl: organization.imageUrl,
      status: organization.status,
      createdBy: organization.createdBy,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
    };
  },
});

export const listMembers = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
    endCursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({
    members: v.array(adminMemberValidator),
    nextCursor: v.optional(v.string()),
    hasNextPage: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ members: AdminMemberListItem[]; nextCursor?: string; hasNextPage: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    await requireSuperAdmin(ctx, identity.subject);

    const limit = Math.min(args.limit ?? 20, MAX_PAGE_LIMIT);
    const { page, continueCursor, isDone } = await paginator(ctx.db, schema)
      .query("organization_members")
      .withIndex("by_organization", (index) => index.eq("organizationId", args.organizationId))
      .order("desc")
      .paginate({ cursor: args.cursor ?? null, numItems: limit, endCursor: args.endCursor });

    const members: AdminMemberListItem[] = page.map((member) => ({
      _id: member._id,
      organizationId: member.organizationId,
      userId: member.userId,
      roleId: member.roleId,
      status: member.status,
      invitedEmail: member.invitedEmail,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
    }));

    return {
      members,
      nextCursor: continueCursor,
      hasNextPage: !isDone,
    };
  },
});

export const listRoles = query({
  args: { organizationId: v.id("organizations") },
  returns: v.object({ roles: v.array(adminRoleValidator) }),
  handler: async (ctx, args): Promise<{ roles: AdminRoleListItem[] }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    await requireSuperAdmin(ctx, identity.subject);

    const page = await ctx.db
      .query("organization_roles")
      .withIndex("by_organization", (index) => index.eq("organizationId", args.organizationId))
      .order("desc")
      .take(MAX_PAGE_LIMIT);

    const roles: AdminRoleListItem[] = page.map((role) => ({
      _id: role._id,
      organizationId: role.organizationId,
      key: role.key,
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      isSystem: role.isSystem,
      createdBy: role.createdBy,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    }));

    return { roles };
  },
});

export const updateMemberRole = mutation({
  args: {
    memberId: v.id("organization_members"),
    roleId: v.id("organization_roles"),
  },
  returns: v.object({ memberId: v.id("organization_members"), roleId: v.id("organization_roles") }),
  handler: async (
    ctx,
    args,
  ): Promise<{ memberId: Id<"organization_members">; roleId: Id<"organization_roles"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const admin = await requireSuperAdmin(ctx, identity.subject);

    const member = await ctx.db.get("organization_members", args.memberId);
    if (member === null) {
      throw new Error("Member not found");
    }

    const role = await ctx.db.get("organization_roles", args.roleId);
    if (role === null || String(role.organizationId) !== String(member.organizationId)) {
      throw new Error("Role not found in this organization");
    }

    const now = Date.now();
    await ctx.db.patch(args.memberId, { roleId: args.roleId, updatedAt: now });

    await createAdminAudit(ctx, {
      adminId: admin._id,
      action: "updateMemberRole",
      target: { type: "organization", id: String(member.organizationId) },
      result: "success",
      payload: { memberId: args.memberId, roleId: args.roleId, userId: member.userId },
      now,
    });

    return { memberId: args.memberId, roleId: args.roleId };
  },
});

export const removeMember = mutation({
  args: { memberId: v.id("organization_members") },
  returns: v.object({ removed: v.boolean(), memberId: v.id("organization_members") }),
  handler: async (
    ctx,
    args,
  ): Promise<{ removed: boolean; memberId: Id<"organization_members"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const admin = await requireSuperAdmin(ctx, identity.subject);

    const member = await ctx.db.get("organization_members", args.memberId);
    if (member === null) {
      throw new Error("Member not found");
    }

    const user = member.userId ? await ctx.db.get("users", member.userId) : null;
    const now = Date.now();
    await ctx.db.delete(args.memberId);

    await createAdminAudit(ctx, {
      adminId: admin._id,
      action: "removeMember",
      target: { type: "organization", id: String(member.organizationId) },
      result: "success",
      payload: {
        memberId: args.memberId,
        userId: member.userId,
        email: member.invitedEmail ?? user?.email ?? undefined,
      },
      now,
    });

    return { removed: true, memberId: args.memberId };
  },
});
