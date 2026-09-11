import { v } from "convex/values";
import { getPage } from "convex-helpers/server/pagination";
import { mutation, query } from "../_generated/server.js";
import schema from "../schema.js";

export const getNativeIdentityByUser = query({
  args: {
    userId: v.id("users"),
    provider: v.string(),
    issuer: v.string(),
  },
  handler: async (ctx, args) => {
    const { page } = await getPage(ctx, {
      table: "auth_identities",
      index: "by_user_provider_issuer",
      startIndexKey: [args.userId, args.provider, args.issuer],
      endIndexKey: [args.userId, args.provider, args.issuer],
      absoluteMaxRows: 1,
      schema,
    });
    return page[0] ?? null;
  },
});

export const createIdentity = mutation({
  args: {
    userId: v.id("users"),
    provider: v.string(),
    issuer: v.string(),
    subject: v.string(),
    tokenIdentifier: v.string(),
    email: v.optional(v.string()),
    emailVerified: v.boolean(),
    sessionId: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.id("auth_identities"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("auth_identities", {
      identityId: crypto.randomUUID(),
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const markEmailVerified = mutation({
  args: {
    identityId: v.id("auth_identities"),
    emailVerified: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.identityId, {
      emailVerified: args.emailVerified,
      updatedAt: now,
    });
  },
});
