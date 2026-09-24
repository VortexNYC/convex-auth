import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const PAGE_LIMIT = 100;

async function requireSuperAdmin(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  const user = await ctx.runQuery(components.convexAuth.native.users.getUserById, {
    userId: identity.subject as Id<"users">,
  });
  if (user === null || !user.isSuperAdmin) {
    throw new Error("Forbidden: super admin required");
  }
  const now = Date.now();
  if (!user.isActive || (user.bannedUntil !== undefined && user.bannedUntil > now)) {
    throw new Error("Forbidden: admin user is banned or inactive");
  }
}

async function checkUserIdentity(ctx: QueryCtx | MutationCtx) {
  return await ctx.auth.getUserIdentity();
}

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity;
}

const adminUserValidator = v.object({
  _id: v.string(),
  email: v.optional(v.string()),
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  isActive: v.boolean(),
  isSuperAdmin: v.optional(v.boolean()),
  roles: v.optional(v.array(v.string())),
  bannedUntil: v.optional(v.number()),
  banReason: v.optional(v.string()),
  createdAt: v.number(),
});

export const listUsers = query({
  args: {
    search: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    isSuperAdmin: v.optional(v.boolean()),
    banned: v.optional(v.boolean()),
    sortBy: v.optional(v.union(v.literal("createdAt"), v.literal("email"), v.literal("name"))),
    sortDirection: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(adminUserValidator),
  handler: async (
    ctx,
    { search, isActive, isSuperAdmin, banned, sortBy, sortDirection, paginationOpts },
  ) => {
    await requireSuperAdmin(ctx);
    const result = await ctx.runQuery(components.convexAuth.admin.users.listUsers, {
      search: search?.trim() || undefined,
      isActive,
      isSuperAdmin,
      banned,
      sortBy,
      sortDirection,
      limit: Math.min(paginationOpts.numItems, PAGE_LIMIT),
      cursor: paginationOpts.cursor ?? undefined,
    });
    return {
      page: result.users,
      continueCursor: result.nextCursor ?? "",
      isDone: !result.hasNextPage,
    };
  },
});

export const getUser = query({
  args: { userId: v.string() },
  returns: v.union(adminUserValidator, v.null()),
  handler: async (ctx, { userId }) => {
    await requireSuperAdmin(ctx);
    const result = await ctx.runQuery(components.convexAuth.admin.users.getUser, {
      userId: userId as Id<"users">,
    });
    if (result === null) {
      return null;
    }
    return {
      _id: String(result._id),
      email: result.email,
      name: result.name,
      image: result.image,
      isActive: result.isActive,
      isSuperAdmin: result.isSuperAdmin,
      roles: result.roles,
      bannedUntil: result.bannedUntil,
      banReason: result.banReason,
      createdAt: result.createdAt,
    };
  },
});

const adminSessionValidator = v.object({
  _id: v.string(),
  sessionId: v.string(),
  userId: v.string(),
  ipAddress: v.optional(v.string()),
  userAgent: v.optional(v.string()),
  expiresAt: v.number(),
  revokedAt: v.optional(v.number()),
  createdAt: v.number(),
});

export const listSessions = query({
  args: {
    userId: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(adminSessionValidator),
  handler: async (ctx, { userId, paginationOpts }) => {
    await requireSuperAdmin(ctx);
    const result = await ctx.runQuery(components.convexAuth.admin.sessions.listSessions, {
      userId: userId ? (userId as Id<"users">) : undefined,
      limit: Math.min(paginationOpts.numItems, PAGE_LIMIT),
      cursor: paginationOpts.cursor ?? undefined,
    });
    return {
      page: result.sessions,
      continueCursor: result.nextCursor ?? "",
      isDone: !result.hasNextPage,
    };
  },
});

const adminOrganizationValidator = v.object({
  _id: v.string(),
  name: v.string(),
  slug: v.string(),
  imageUrl: v.optional(v.string()),
  status: v.string(),
  createdBy: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const listOrganizations = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(adminOrganizationValidator),
  handler: async (ctx, { paginationOpts }) => {
    await requireSuperAdmin(ctx);
    const result = await ctx.runQuery(components.convexAuth.admin.organisations.listOrganizations, {
      limit: Math.min(paginationOpts.numItems, PAGE_LIMIT),
      cursor: paginationOpts.cursor ?? undefined,
    });
    return {
      page: result.organizations,
      continueCursor: result.nextCursor ?? "",
      isDone: !result.hasNextPage,
    };
  },
});

export const getOrganization = query({
  args: { organizationId: v.string() },
  returns: v.union(adminOrganizationValidator, v.null()),
  handler: async (ctx, { organizationId }) => {
    await requireSuperAdmin(ctx);
    return await ctx.runQuery(components.convexAuth.admin.organisations.getOrganization, {
      organizationId: organizationId as Id<"organizations">,
    });
  },
});

const adminMemberValidator = v.object({
  _id: v.string(),
  organizationId: v.string(),
  userId: v.optional(v.string()),
  roleId: v.string(),
  status: v.string(),
  invitedEmail: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const listMembers = query({
  args: { organizationId: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(adminMemberValidator),
  handler: async (ctx, { organizationId, paginationOpts }) => {
    await requireSuperAdmin(ctx);
    const result = await ctx.runQuery(components.convexAuth.admin.organisations.listMembers, {
      organizationId: organizationId as Id<"organizations">,
      limit: Math.min(paginationOpts.numItems, PAGE_LIMIT),
      cursor: paginationOpts.cursor ?? undefined,
    });
    return {
      page: result.members,
      continueCursor: result.nextCursor ?? "",
      isDone: !result.hasNextPage,
    };
  },
});

const adminRoleValidator = v.object({
  _id: v.string(),
  organizationId: v.string(),
  key: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  permissions: v.array(v.string()),
  isSystem: v.boolean(),
  createdBy: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const listRoles = query({
  args: { organizationId: v.string() },
  returns: v.object({ roles: v.array(adminRoleValidator) }),
  handler: async (ctx, { organizationId }) => {
    await requireSuperAdmin(ctx);
    const result = await ctx.runQuery(components.convexAuth.admin.organisations.listRoles, {
      organizationId: organizationId as Id<"organizations">,
    });
    return { roles: result.roles };
  },
});

export const updateMemberRole = mutation({
  args: { memberId: v.string(), roleId: v.string() },
  returns: v.object({ memberId: v.string(), roleId: v.string() }),
  handler: async (ctx, { memberId, roleId }) => {
    await requireSuperAdmin(ctx);
    return await ctx.runMutation(components.convexAuth.admin.organisations.updateMemberRole, {
      memberId: memberId as Id<"organization_members">,
      roleId: roleId as Id<"organization_roles">,
    });
  },
});

export const removeMember = mutation({
  args: { memberId: v.string() },
  returns: v.object({ removed: v.boolean(), memberId: v.string() }),
  handler: async (ctx, { memberId }) => {
    await requireSuperAdmin(ctx);
    return await ctx.runMutation(components.convexAuth.admin.organisations.removeMember, {
      memberId: memberId as Id<"organization_members">,
    });
  },
});

const adminAuditValidator = v.object({
  _id: v.string(),
  adminId: v.string(),
  action: v.string(),
  targetType: v.string(),
  targetId: v.string(),
  result: v.string(),
  createdAt: v.number(),
});

function parseDate(date: string | undefined, endOfDay: boolean): number | undefined {
  if (!date) return undefined;
  const time = endOfDay ? `${date}T23:59:59.999Z` : `${date}T00:00:00.000Z`;
  const parsed = Date.parse(time);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export const listAdminAudits = query({
  args: {
    action: v.optional(v.string()),
    targetType: v.optional(v.string()),
    targetId: v.optional(v.string()),
    adminId: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(adminAuditValidator),
  handler: async (ctx, { action, targetType, targetId, adminId, from, to, paginationOpts }) => {
    await requireSuperAdmin(ctx);
    const result = await ctx.runQuery(components.convexAuth.admin.audit.listAdminAudits, {
      action: action?.trim() || undefined,
      targetType: targetType?.trim() || undefined,
      targetId: targetId?.trim() || undefined,
      adminId: adminId?.trim() || undefined,
      from: parseDate(from?.trim(), false),
      to: parseDate(to?.trim(), true),
      limit: Math.min(paginationOpts.numItems, PAGE_LIMIT),
      cursor: paginationOpts.cursor ?? undefined,
    });
    return {
      page: result.audits,
      continueCursor: result.nextCursor ?? "",
      isDone: !result.hasNextPage,
    };
  },
});

export const banUser = mutation({
  args: {
    userId: v.string(),
    bannedUntil: v.optional(v.number()),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    await ctx.runMutation(components.convexAuth.admin.users.banUser, {
      userId: args.userId as Id<"users">,
      bannedUntil: args.bannedUntil,
      reason: args.reason,
    });
    return null;
  },
});

export const unbanUser = mutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    await ctx.runMutation(components.convexAuth.admin.users.unbanUser, {
      userId: args.userId as Id<"users">,
    });
    return null;
  },
});

export const removeUser = mutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    await ctx.runMutation(components.convexAuth.admin.users.removeUser, {
      userId: args.userId as Id<"users">,
    });
    return null;
  },
});

export const claimSuperAdmin = mutation({
  args: {},
  returns: v.object({ userId: v.string() }),
  handler: async (ctx) => {
    const identity = await requireUser(ctx);
    const user = await ctx.runQuery(components.convexAuth.native.users.getUserById, {
      userId: identity.subject as Id<"users">,
    });
    if (user === null) {
      throw new Error("User not found");
    }
    const result = await ctx.runMutation(components.convexAuth.admin.users.claimSuperAdmin, {});
    return { userId: String(result.userId) };
  },
});

export const revokeSession = mutation({
  args: { sessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    await ctx.runMutation(components.convexAuth.admin.sessions.revokeSession, args);
    return null;
  },
});

export const getImpersonationState = query({
  args: { sessionId: v.string() },
  returns: v.object({
    impersonatedBy: v.optional(v.string()),
    userId: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const identity = await checkUserIdentity(ctx);
    if (!identity) return { impersonatedBy: undefined, userId: undefined };
    const result = await ctx.runQuery(components.convexAuth.admin.sessions.getImpersonationState, {
      sessionId: args.sessionId,
    });
    return {
      impersonatedBy: result.impersonatedBy ? result.impersonatedBy : undefined,
      userId: result.userId ? result.userId : undefined,
    };
  },
});

export const stopImpersonation = mutation({
  args: { sessionId: v.string() },
  returns: v.object({ revoked: v.boolean() }),
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const result = await ctx.runMutation(components.convexAuth.admin.sessions.stopImpersonation, {
      sessionId: args.sessionId,
    });
    return result;
  },
});

export const impersonateUser = mutation({
  args: { userId: v.string() },
  returns: v.object({
    token: v.string(),
    refreshToken: v.string(),
    sessionId: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    const result = await ctx.runMutation(components.convexAuth.admin.sessions.impersonateUser, {
      userId: args.userId as Id<"users">,
    });
    return {
      token: result.token,
      refreshToken: result.refreshToken,
      sessionId: result.sessionId,
    };
  },
});
