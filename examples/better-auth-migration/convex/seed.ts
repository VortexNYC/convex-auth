import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { components } from "./_generated/api";

const now = Date.now();

export const all = internalMutation({
  args: {},
  returns: v.object({
    seeded: v.boolean(),
    userId: v.string(),
    accountId: v.string(),
  }),
  handler: async (ctx) => {
    const user = await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "user",
        data: {
          name: "Demo User",
          email: "demo@example.com",
          emailVerified: true,
          image: null,
          createdAt: now,
          updatedAt: now,
        },
      },
    });

    const userId = (user as { _id: string })._id;

    const account = await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "account",
        data: {
          userId,
          accountId: crypto.randomUUID(),
          providerId: "email",
          password: "better-auth-scrypt-placeholder",
          createdAt: now,
          updatedAt: now,
        },
      },
    });

    await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "session",
        data: {
          userId,
          token: crypto.randomUUID(),
          expiresAt: now + 24 * 60 * 60 * 1000,
          createdAt: now,
          updatedAt: now,
        },
      },
    });

    return {
      seeded: true,
      userId,
      accountId: (account as { _id: string })._id,
    };
  },
});
