import { query, mutation } from "../_generated/server.js";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel.js";
import { createAdminAudit, requireSuperAdmin } from "../../convex-runtime/admin/admin.js";

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

export const listUsers = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    users: v.array(v.any()),
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
    const q = ctx.db.query("users").order("desc");
    const page = await q.take(limit);

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
      nextCursor: undefined,
      hasNextPage: users.length === limit,
    };
  },
});

export const getUser = query({
  args: { userId: v.id("users") },
  returns: v.any(),
  handler: async (ctx, args): Promise<Doc<"users"> | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    await requireSuperAdmin(ctx, identity.subject);
    return await ctx.db.get("users", args.userId);
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
    if (String(args.userId) === admin._id) {
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
      adminId: admin._id,
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
      adminId: admin._id,
      action: "unbanUser",
      target: { type: "user", id: String(args.userId) },
      result: "success",
      payload: { email: target.email },
      now,
    });

    return { userId: args.userId };
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
    if (String(args.userId) === admin._id) {
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
      adminId: admin._id,
      action: "removeUser",
      target: { type: "user", id: String(args.userId) },
      result: "success",
      payload: { email: target.email, reason: args.reason },
      now,
    });

    return { deleted: true, userId: args.userId };
  },
});
