import { paginator } from "convex-helpers/server/pagination";
import { query, mutation } from "../_generated/server.js";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel.js";
import {
  createAdminAudit,
  getImpersonationSessionDuration,
  isUserBanned,
  requireSuperAdmin,
} from "../../convex-runtime/admin/admin.js";
import { mintToken } from "../../convex-runtime/native/jwt.js";
import { generateVerificationToken, hashToken } from "../../convex-runtime/native/tokens.js";
import { revokeSessionFamily } from "../native/sessions.js";
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

/**
 * Revokes the session's whole lineage, not just the presented row — a family
 * is one sign-in lineage, and if the presented session is suspect its siblings
 * (same lineage, minted by concurrent refreshes) are too.
 */
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
    await revokeSessionFamily(
      ctx,
      session.familyId ?? session.sessionId,
      String(session.userId),
      now,
      null,
    );

    await createAdminAudit(ctx, {
      adminId: String(admin._id),
      action: "revokeSession",
      target: { type: "session", id: session.sessionId },
      result: "success",
      payload: { userId: session.userId, familyId: session.familyId ?? session.sessionId },
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
        await ctx.db.patch("authSessions", session._id, { revokedAt: now, updatedAt: now });
        count++;
      }
    }

    for await (const token of ctx.db
      .query("authRefreshTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))) {
      if (token.revokedAt === undefined) {
        await ctx.db.patch("authRefreshTokens", token._id, { revokedAt: now, updatedAt: now });
      }
    }

    await createAdminAudit(ctx, {
      adminId: String(admin._id),
      action: "revokeAllSessionsForUser",
      target: { type: "user", id: String(args.userId) },
      result: "success",
      payload: { count, email: user.email },
      now,
    });

    return { count };
  },
});

export const impersonateUser = mutation({
  args: { userId: v.id("users") },
  returns: v.object({
    token: v.string(),
    refreshToken: v.string(),
    sessionId: v.string(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const admin = await requireSuperAdmin(ctx, identity.subject);

    const target = await ctx.db.get("users", args.userId);
    if (target === null) {
      throw new Error("User not found");
    }
    if (isUserBanned(target)) {
      throw new Error("Cannot impersonate a banned or inactive user");
    }
    if (target.isSuperAdmin) {
      throw new Error("Cannot impersonate another super admin");
    }
    if (String(args.userId) === String(admin._id)) {
      throw new Error("Cannot impersonate yourself");
    }

    const identityRecord = await ctx.db
      .query("auth_identities")
      .withIndex("by_user_provider_issuer", (q) =>
        q.eq("userId", args.userId).eq("provider", "password").eq("issuer", "native"),
      )
      .unique();
    if (identityRecord === null) {
      throw new Error("Cannot impersonate a user without a native identity");
    }

    const now = Date.now();
    const sessionTtl = getImpersonationSessionDuration();
    const sessionId = crypto.randomUUID();
    const refreshToken = generateVerificationToken();
    const refreshTokenHash = await hashToken(refreshToken);
    const expiresAt = now + sessionTtl;

    const token = await mintToken(
      String(args.userId),
      sessionId,
      { identityId: String(identityRecord._id) },
      { expiresInSeconds: Math.floor(sessionTtl / 1000) },
    );

    await ctx.db.insert("authSessions", {
      sessionId,
      familyId: sessionId,
      userId: args.userId,
      identityId: identityRecord._id,
      token,
      expiresAt,
      impersonatedBy: admin._id,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("authRefreshTokens", {
      tokenHash: refreshTokenHash,
      sessionId,
      familyId: sessionId,
      userId: args.userId,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    await createAdminAudit(ctx, {
      adminId: String(admin._id),
      action: "impersonateUser",
      target: { type: "user", id: String(args.userId) },
      result: "success",
      payload: { sessionId, email: target.email },
      now,
    });

    return { token, refreshToken, sessionId };
  },
});

export const getImpersonationState = query({
  args: { sessionId: v.string() },
  returns: v.object({
    impersonatedBy: v.optional(v.string()),
    userId: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { impersonatedBy: undefined, userId: undefined };
    }
    const session = await ctx.db
      .query("authSessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (
      session === null ||
      String(session.userId) !== identity.subject ||
      session.impersonatedBy === undefined ||
      session.revokedAt !== undefined ||
      session.expiresAt <= Date.now()
    ) {
      return { impersonatedBy: undefined, userId: undefined };
    }
    return {
      impersonatedBy: String(session.impersonatedBy),
      userId: identity.subject,
    };
  },
});

/**
 * Ends an impersonation session by revoking the whole lineage — converged
 * siblings and their refresh tokens would otherwise keep minting sessions.
 */
export const stopImpersonation = mutation({
  args: { sessionId: v.string() },
  returns: v.object({ revoked: v.boolean() }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const session = await ctx.db
      .query("authSessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (
      session === null ||
      String(session.userId) !== identity.subject ||
      session.impersonatedBy === undefined
    ) {
      throw new Error("Impersonation session not found");
    }
    const now = Date.now();
    await revokeSessionFamily(
      ctx,
      session.familyId ?? session.sessionId,
      String(session.userId),
      now,
      null,
    );
    await createAdminAudit(ctx, {
      adminId: String(session.impersonatedBy),
      action: "stopImpersonation",
      target: { type: "session", id: session.sessionId },
      result: "success",
      payload: { userId: session.userId },
      now,
    });
    return { revoked: true };
  },
});
