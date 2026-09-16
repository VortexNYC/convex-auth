import { paginator } from "convex-helpers/server/pagination";
import { query, mutation } from "../_generated/server.js";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel.js";
import { createAdminAudit, requireSuperAdmin } from "../../convex-runtime/admin/admin.js";
import schema from "../schema.js";

const MAX_PAGE_LIMIT = 100;

type AdminSessionListItem = Pick<
  Doc<"authSessions">,
  | "_id"
  | "sessionId"
  | "userId"
  | "ipAddress"
  | "userAgent"
  | "expiresAt"
  | "revokedAt"
  | "createdAt"
>;

const adminSessionValidator = v.object({
  _id: v.id("authSessions"),
  sessionId: v.string(),
  userId: v.id("users"),
  ipAddress: v.optional(v.string()),
  userAgent: v.optional(v.string()),
  expiresAt: v.number(),
  revokedAt: v.optional(v.number()),
  createdAt: v.number(),
});

export const listSessions = query({
  args: {
    userId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    sessions: v.array(adminSessionValidator),
    nextCursor: v.optional(v.string()),
    hasNextPage: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ sessions: AdminSessionListItem[]; nextCursor?: string; hasNextPage: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    await requireSuperAdmin(ctx, identity.subject);

    const limit = Math.min(args.limit ?? 20, MAX_PAGE_LIMIT);
    const userId = args.userId;
    const base = paginator(ctx.db, schema).query("authSessions");
    const q = userId
      ? base
          .withIndex("by_user", (index) => index.eq("userId", userId as Id<"users">))
          .order("desc")
      : base.order("desc");
    const { page, continueCursor, isDone } = await q.paginate({
      cursor: args.cursor ?? null,
      numItems: limit,
    });

    const sessions: AdminSessionListItem[] = page.map((session) => ({
      _id: session._id,
      sessionId: session.sessionId,
      userId: session.userId,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      createdAt: session.createdAt,
    }));

    return {
      sessions,
      nextCursor: continueCursor,
      hasNextPage: !isDone,
    };
  },
});

export const getSession = query({
  args: { sessionId: v.string() },
  returns: v.union(adminSessionValidator, v.null()),
  handler: async (ctx, args): Promise<AdminSessionListItem | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    await requireSuperAdmin(ctx, identity.subject);

    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("by_session_id", (index) => index.eq("sessionId", args.sessionId))
      .take(1);
    const session = sessions[0];
    if (session === undefined) {
      return null;
    }
    return {
      _id: session._id,
      sessionId: session.sessionId,
      userId: session.userId,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      createdAt: session.createdAt,
    };
  },
});

export const revokeSession = mutation({
  args: { sessionId: v.string() },
  returns: v.object({ revoked: v.boolean(), sessionId: v.string() }),
  handler: async (ctx, args): Promise<{ revoked: boolean; sessionId: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const admin = await requireSuperAdmin(ctx, identity.subject);

    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .take(1);
    const session = sessions[0];
    if (session === undefined) {
      throw new Error("Session not found");
    }

    const now = Date.now();
    await ctx.db.patch(session._id, { revokedAt: now, updatedAt: now });

    for await (const token of ctx.db
      .query("authRefreshTokens")
      .withIndex("by_session", (q) => q.eq("sessionId", session.sessionId))) {
      await ctx.db.patch(token._id, { revokedAt: now, updatedAt: now });
    }

    await createAdminAudit(ctx, {
      adminId: admin._id,
      action: "revokeSession",
      target: { type: "session", id: session.sessionId },
      result: "success",
      payload: { userId: session.userId },
      now,
    });

    return { revoked: true, sessionId: session.sessionId };
  },
});

export const revokeAllSessionsForUser = mutation({
  args: { userId: v.id("users") },
  returns: v.object({ count: v.number() }),
  handler: async (ctx, args): Promise<{ count: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const admin = await requireSuperAdmin(ctx, identity.subject);

    const user = await ctx.db.get("users", args.userId);
    if (user === null) {
      throw new Error("User not found");
    }

    const now = Date.now();
    let count = 0;

    for await (const session of ctx.db
      .query("authSessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))) {
      if (session.revokedAt === undefined) {
        await ctx.db.patch(session._id, { revokedAt: now, updatedAt: now });
        count++;
      }
    }

    for await (const token of ctx.db
      .query("authRefreshTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))) {
      if (token.revokedAt === undefined) {
        await ctx.db.patch(token._id, { revokedAt: now, updatedAt: now });
      }
    }

    await createAdminAudit(ctx, {
      adminId: admin._id,
      action: "revokeAllSessionsForUser",
      target: { type: "user", id: String(args.userId) },
      result: "success",
      payload: { count, email: user.email },
      now,
    });

    return { count };
  },
});
