import { v } from "convex/values";
import { getOneFrom } from "convex-helpers/server/relationships";
import { mutation, query } from "../_generated/server.js";

export const createVerifier = mutation({
  args: {
    verifierId: v.string(),
    type: v.string(),
    provider: v.optional(v.string()),
    codeChallenge: v.optional(v.string()),
    codeChallengeMethod: v.optional(v.string()),
    redirectUri: v.optional(v.string()),
    metadata: v.optional(v.string()),
    expiresAt: v.number(),
  },
  returns: v.id("authVerifiers"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("authVerifiers", {
      ...args,
      consumedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getVerifierByVerifierId = query({
  args: { verifierId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("authVerifiers"),
      _creationTime: v.number(),
      verifierId: v.string(),
      type: v.string(),
      provider: v.optional(v.string()),
      codeChallenge: v.optional(v.string()),
      codeChallengeMethod: v.optional(v.string()),
      redirectUri: v.optional(v.string()),
      metadata: v.optional(v.string()),
      expiresAt: v.number(),
      consumedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    return await getOneFrom(
      ctx.db,
      "authVerifiers",
      "by_verifier_id",
      args.verifierId,
      "verifierId",
    );
  },
});

export const consumeVerifier = mutation({
  args: { verifierId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("authVerifiers"),
      _creationTime: v.number(),
      verifierId: v.string(),
      type: v.string(),
      provider: v.optional(v.string()),
      codeChallenge: v.optional(v.string()),
      codeChallengeMethod: v.optional(v.string()),
      redirectUri: v.optional(v.string()),
      metadata: v.optional(v.string()),
      expiresAt: v.number(),
      consumedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now();
    const verifier = await getOneFrom(
      ctx.db,
      "authVerifiers",
      "by_verifier_id",
      args.verifierId,
      "verifierId",
    );
    if (!verifier || verifier.consumedAt || verifier.expiresAt <= now) {
      return null;
    }
    await ctx.db.patch("authVerifiers", verifier._id, { consumedAt: now, updatedAt: now });
    return { ...verifier, consumedAt: now, updatedAt: now };
  },
});
