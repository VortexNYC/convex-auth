import { mutation } from "../_generated/server.js";
import { v } from "convex/values";

export const createAnonymousUser = mutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  returns: v.object({
    userId: v.id("users"),
    identityId: v.id("auth_identities"),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      email: args.email.toLowerCase().trim(),
      name: args.name,
      image: args.image,
      emailVerified: false,
      isActive: true,
      isAnonymous: true,
      createdAt: now,
      updatedAt: now,
    });
    const identityId = await ctx.db.insert("auth_identities", {
      identityId: crypto.randomUUID(),
      userId,
      provider: "anonymous",
      issuer: "native",
      subject: crypto.randomUUID(),
      tokenIdentifier: args.email.toLowerCase().trim(),
      email: args.email.toLowerCase().trim(),
      emailVerified: false,
      sessionId: null,
      createdAt: now,
      updatedAt: now,
    });
    return { userId, identityId };
  },
});

export const linkAnonymousUser = mutation({
  args: {
    userId: v.id("users"),
    email: v.string(),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    emailVerified: v.optional(v.boolean()),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const patch: {
      email: string;
      name?: string;
      image?: string;
      emailVerified: boolean;
      isAnonymous: false;
      updatedAt: number;
    } = {
      email: args.email.toLowerCase().trim(),
      emailVerified: args.emailVerified ?? false,
      isAnonymous: false,
      updatedAt: now,
    };
    if (args.name !== undefined) patch.name = args.name;
    if (args.image !== undefined) patch.image = args.image;
    await ctx.db.patch(args.userId, patch);

    for await (const identity of ctx.db
      .query("auth_identities")
      .withIndex("by_user_provider_issuer", (q) =>
        q.eq("userId", args.userId).eq("provider", "anonymous").eq("issuer", "native"),
      )) {
      await ctx.db.delete(identity._id);
    }

    return { success: true };
  },
});
