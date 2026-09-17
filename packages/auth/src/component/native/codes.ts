import { v } from "convex/values";
import { getPage } from "convex-helpers/server/pagination";
import { mutation, query, type QueryCtx } from "../_generated/server.js";
import schema, { verificationCodeTypeValidator } from "../schema.js";

const MAX_VERIFICATION_CODES_PER_USER = 1000;

async function getVerificationCodeByTokenHashAndType(
  ctx: { db: QueryCtx["db"] },
  tokenHash: string,
  type: string,
) {
  const { page } = await getPage(ctx, {
    table: "authVerificationCodes",
    index: "by_token_hash",
    startIndexKey: [tokenHash, type],
    endIndexKey: [tokenHash, type],
    absoluteMaxRows: 1,
    schema,
  });
  return page[0] ?? null;
}

async function getVerificationCodesByUserType(
  ctx: { db: QueryCtx["db"] },
  userId: string,
  type: string | undefined,
) {
  const startIndexKey = type ? [userId, type] : [userId];
  const { page } = await getPage(ctx, {
    table: "authVerificationCodes",
    index: "by_user_type",
    startIndexKey,
    endIndexKey: startIndexKey,
    absoluteMaxRows: MAX_VERIFICATION_CODES_PER_USER,
    schema,
  });
  return page;
}

export const createVerificationCode = mutation({
  args: {
    userId: v.id("users"),
    type: verificationCodeTypeValidator,
    tokenHash: v.string(),
    identityId: v.optional(v.string()),
    rememberMe: v.optional(v.boolean()),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await getVerificationCodesByUserType(ctx, args.userId, args.type);

    await Promise.all(existing.map((code) => ctx.db.patch(code._id, { consumedAt: now })));

    return await ctx.db.insert("authVerificationCodes", {
      ...args,
      consumedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getVerificationCodeByTokenHash = query({
  args: {
    tokenHash: v.string(),
    type: verificationCodeTypeValidator,
  },
  handler: async (ctx, args) => {
    return await getVerificationCodeByTokenHashAndType(ctx, args.tokenHash, args.type);
  },
});

export const consumeVerificationCode = mutation({
  args: {
    tokenHash: v.string(),
    type: verificationCodeTypeValidator,
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const code = await getVerificationCodeByTokenHashAndType(ctx, args.tokenHash, args.type);

    if (!code) {
      return null;
    }

    if (code.consumedAt || code.expiresAt <= now) {
      return null;
    }

    await ctx.db.patch(code._id, { consumedAt: now, updatedAt: now });
    return (await ctx.db.get(code._id)) ?? null;
  },
});

export const revokeVerificationCodesForUser = mutation({
  args: {
    userId: v.id("users"),
    type: verificationCodeTypeValidator,
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await getVerificationCodesByUserType(ctx, args.userId, args.type);

    const unconsumed = existing.filter((code) => code.consumedAt === undefined);

    await Promise.all(
      unconsumed.map((code) => ctx.db.patch(code._id, { consumedAt: now, updatedAt: now })),
    );

    return unconsumed.length;
  },
});

export const cleanupVerificationCodes = mutation({
  args: {
    userId: v.id("users"),
    type: v.optional(verificationCodeTypeValidator),
    maxAgeMs: v.optional(v.number()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const maxAgeMs = args.maxAgeMs ?? 0;
    const minConsumedAt = now - maxAgeMs;

    const existing = await getVerificationCodesByUserType(ctx, args.userId, args.type);

    let deleted = 0;
    for (const code of existing) {
      if (code.consumedAt !== undefined && code.consumedAt <= minConsumedAt) {
        await ctx.db.delete(code._id);
        deleted++;
      } else if (code.expiresAt <= now) {
        await ctx.db.delete(code._id);
        deleted++;
      }
    }

    return deleted;
  },
});
