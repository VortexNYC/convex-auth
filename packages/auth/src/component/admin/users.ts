import { paginator } from "convex-helpers/server/pagination";
import { query, mutation } from "../_generated/server.js";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel.js";
import { createAdminAudit, requireSuperAdmin } from "../../convex-runtime/admin/admin.js";
import schema from "../schema.js";

const MAX_PAGE_LIMIT = 100;

type AdminUserListItem = Pick<
  Doc<"users">,
  | "_id"
  | "email"
  | "name"
  | "image"
  | "isActive"
  | "isSuperAdmin"
  | "bannedUntil"
  | "banReason"
  | "createdAt"
>;

const adminUserValidator = v.object({
  _id: v.id("users"),
  email: v.optional(v.string()),
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  isActive: v.boolean(),
  isSuperAdmin: v.optional(v.boolean()),
  bannedUntil: v.optional(v.number()),
  banReason: v.optional(v.string()),
  createdAt: v.number(),
});

export const listUsers = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    users: v.array(adminUserValidator),
    nextCursor: v.optional(v.string()),
    hasNextPage: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ users: AdminUserListItem[]; nextCursor?: string; hasNextPage: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    await requireSuperAdmin(ctx, identity.subject);

    const limit = Math.min(args.limit ?? 20, MAX_PAGE_LIMIT);
    const { page, continueCursor, isDone } = await paginator(ctx.db, schema)
      .query("users")
      .order("desc")
      .paginate({ cursor: args.cursor ?? null, numItems: limit });

    const users: AdminUserListItem[] = page.map((user) => ({
      _id: user._id,
      email: user.email,
      name: user.name,
      image: user.image,
      isActive: user.isActive,
      isSuperAdmin: user.isSuperAdmin,
      bannedUntil: user.bannedUntil,
      banReason: user.banReason,
      createdAt: user.createdAt,
    }));

    return {
      users,
      nextCursor: continueCursor,
      hasNextPage: !isDone,
    };
  },
});

export const getUser = query({
  args: { userId: v.id("users") },
  returns: v.union(adminUserValidator, v.null()),
  handler: async (ctx, args): Promise<AdminUserListItem | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    await requireSuperAdmin(ctx, identity.subject);
    const user = await ctx.db.get("users", args.userId);
    if (user === null) {
      return null;
    }
    return {
      _id: user._id,
      email: user.email,
      name: user.name,
      image: user.image,
      isActive: user.isActive,
      isSuperAdmin: user.isSuperAdmin,
      bannedUntil: user.bannedUntil,
      banReason: user.banReason,
      createdAt: user.createdAt,
    };
  },
});

export const banUser = mutation({
  args: {
    userId: v.id("users"),
    bannedUntil: v.optional(v.number()),
    reason: v.optional(v.string()),
  },
  returns: v.object({ userId: v.id("users"), bannedUntil: v.optional(v.number()) }),
  handler: async (ctx, args): Promise<{ userId: Id<"users">; bannedUntil?: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const admin = await requireSuperAdmin(ctx, identity.subject);
    if (String(args.userId) === String(admin._id)) {
      throw new Error("Cannot ban yourself");
    }

    const now = Date.now();
    const target = await ctx.db.get("users", args.userId);
    if (target === null) {
      throw new Error("User not found");
    }

    await ctx.db.patch(args.userId, {
      bannedAt: now,
      bannedUntil: args.bannedUntil,
      banReason: args.reason,
      updatedAt: now,
    });

    await createAdminAudit(ctx, {
      adminId: String(admin._id),
      action: "banUser",
      target: { type: "user", id: String(args.userId) },
      result: "success",
      payload: {
        email: target.email,
        reason: args.reason,
        bannedUntil: args.bannedUntil,
      },
      now,
    });

    return { userId: args.userId, bannedUntil: args.bannedUntil };
  },
});

export const unbanUser = mutation({
  args: { userId: v.id("users") },
  returns: v.object({ userId: v.id("users") }),
  handler: async (ctx, args): Promise<{ userId: Id<"users"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const admin = await requireSuperAdmin(ctx, identity.subject);

    const target = await ctx.db.get("users", args.userId);
    if (target === null) {
      throw new Error("User not found");
    }

    const now = Date.now();
    await ctx.db.patch(args.userId, {
      bannedAt: undefined,
      bannedUntil: undefined,
      banReason: undefined,
      updatedAt: now,
    });

    await createAdminAudit(ctx, {
      adminId: String(admin._id),
      action: "unbanUser",
      target: { type: "user", id: String(args.userId) },
      result: "success",
      payload: { email: target.email },
      now,
    });

    return { userId: args.userId };
  },
});

export const claimSuperAdmin = mutation({
  args: {},
  returns: v.object({ userId: v.id("users") }),
  handler: async (ctx): Promise<{ userId: Id<"users"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get("users", identity.subject as Id<"users">);
    if (user === null) {
      throw new Error("User not found");
    }

    const now = Date.now();
    if (
      user.isAnonymous ||
      !user.isActive ||
      (user.bannedUntil !== undefined && user.bannedUntil > now)
    ) {
      throw new Error("User is not eligible to claim super admin");
    }

    if (user.isSuperAdmin) {
      return { userId: user._id };
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_super_admin", (q) => q.eq("isSuperAdmin", true))
      .take(1);
    if (existing.length > 0) {
      throw new Error("A super admin already exists");
    }

    await ctx.db.patch(user._id, {
      isSuperAdmin: true,
      updatedAt: now,
    });

    await createAdminAudit(ctx, {
      adminId: String(user._id),
      action: "claimSuperAdmin",
      target: { type: "user", id: String(user._id) },
      result: "success",
      payload: { email: user.email },
      now,
    });

    return { userId: user._id };
  },
});

export const removeUser = mutation({
  args: { userId: v.id("users"), reason: v.optional(v.string()) },
  returns: v.object({ deleted: v.boolean(), userId: v.id("users") }),
  handler: async (ctx, args): Promise<{ deleted: boolean; userId: Id<"users"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const admin = await requireSuperAdmin(ctx, identity.subject);
    if (String(args.userId) === String(admin._id)) {
      throw new Error("Cannot remove yourself");
    }

    const target = await ctx.db.get("users", args.userId);
    if (target === null) {
      throw new Error("User not found");
    }

    for await (const identity of ctx.db
      .query("auth_identities")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))) {
      await ctx.db.delete(identity._id);
    }

    for await (const account of ctx.db
      .query("authAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))) {
      await ctx.db.delete(account._id);
    }

    for await (const session of ctx.db
      .query("authSessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))) {
      await ctx.db.delete(session._id);
    }

    for await (const token of ctx.db
      .query("authRefreshTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))) {
      await ctx.db.delete(token._id);
    }

    for await (const code of ctx.db
      .query("authVerificationCodes")
      .withIndex("by_user_type", (q) => q.eq("userId", args.userId))) {
      await ctx.db.delete(code._id);
    }

    await ctx.db.delete(args.userId);

    const now = Date.now();
    await createAdminAudit(ctx, {
      adminId: String(admin._id),
      action: "removeUser",
      target: { type: "user", id: String(args.userId) },
      result: "success",
      payload: { email: target.email, reason: args.reason },
      now,
    });

    return { deleted: true, userId: args.userId };
  },
});
