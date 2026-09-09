import { v } from "convex/values";
import { getPage } from "convex-helpers/server/pagination";
import { getOneFrom } from "convex-helpers/server/relationships";
import { mutation, query, type QueryCtx } from "../_generated/server.js";
import schema from "../schema.js";

const MAX_REFRESH_TOKENS_PER_SESSION = 10;
const MAX_REFRESH_TOKENS_PER_USER = 1000;

async function getRefreshTokensBySession(ctx: { db: QueryCtx["db"] }, sessionId: string) {
  const { page } = await getPage(ctx, {
    table: "authRefreshTokens",
    index: "by_session",
    startIndexKey: [sessionId],
    endIndexKey: [sessionId],
    absoluteMaxRows: MAX_REFRESH_TOKENS_PER_SESSION,
    schema,
  });
  return page;
}

async function getRefreshTokensByUser(ctx: { db: QueryCtx["db"] }, userId: string) {
  const { page } = await getPage(ctx, {
    table: "authRefreshTokens",
    index: "by_user",
    startIndexKey: [userId],
    endIndexKey: [userId],
    absoluteMaxRows: MAX_REFRESH_TOKENS_PER_USER,
    schema,
  });
  return page;
}

export const createRefreshToken = mutation({
  args: {
    tokenHash: v.string(),
    sessionId: v.string(),
    userId: v.id("users"),
    expiresAt: v.number(),
  },
  returns: v.id("authRefreshTokens"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("authRefreshTokens", {
      ...args,
      revokedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getRefreshTokenByTokenHash = query({
  args: { tokenHash: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("authRefreshTokens"),
      _creationTime: v.number(),
      tokenHash: v.string(),
      sessionId: v.string(),
      userId: v.id("users"),
      expiresAt: v.number(),
      revokedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    return await getOneFrom(
      ctx.db,
      "authRefreshTokens",
      "by_token_hash",
      args.tokenHash,
      "tokenHash",
    );
  },
});

export const consumeRefreshToken = mutation({
  args: { tokenHash: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("authRefreshTokens"),
      _creationTime: v.number(),
      tokenHash: v.string(),
      sessionId: v.string(),
      userId: v.id("users"),
      expiresAt: v.number(),
      revokedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now();
    const token = await getOneFrom(
      ctx.db,
      "authRefreshTokens",
      "by_token_hash",
      args.tokenHash,
      "tokenHash",
    );
    if (!token || token.revokedAt || token.expiresAt <= now) {
      return null;
    }
    await ctx.db.patch(token._id, { revokedAt: now, updatedAt: now });
    return { ...token, revokedAt: now, updatedAt: now };
  },
});

export const revokeRefreshTokensForSession = mutation({
  args: { sessionId: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const tokens = await getRefreshTokensBySession(ctx, args.sessionId);
    let revoked = 0;
    for (const token of tokens) {
      if (!token.revokedAt && token.expiresAt > now) {
        await ctx.db.patch(token._id, { revokedAt: now, updatedAt: now });
        revoked++;
      }
    }
    return revoked;
  },
});

export const revokeRefreshTokensForUser = mutation({
  args: { userId: v.id("users") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const tokens = await getRefreshTokensByUser(ctx, args.userId);
    let revoked = 0;
    for (const token of tokens) {
      if (!token.revokedAt && token.expiresAt > now) {
        await ctx.db.patch(token._id, { revokedAt: now, updatedAt: now });
        revoked++;
      }
    }
    return revoked;
  },
});

const CLEANUP_BATCH_SIZE = 250;

export const cleanupExpiredRefreshTokens = mutation({
  args: { batchSize: v.optional(v.number()), before: v.optional(v.number()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = args.before ?? Date.now();
    const batchSize = args.batchSize ?? CLEANUP_BATCH_SIZE;
    const expired = await ctx.db
      .query("authRefreshTokens")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", now))
      .take(batchSize);
    await Promise.all(expired.map((token) => ctx.db.delete(token._id)));
    return expired.length;
  },
});
