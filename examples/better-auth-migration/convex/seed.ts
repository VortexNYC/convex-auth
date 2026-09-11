import { v } from "convex/values";
import { hashPassword } from "better-auth/crypto";
import { internalMutation } from "./_generated/server";
import { components } from "./_generated/api";

const now = Date.now();

export const all = internalMutation({
  args: {},
  returns: v.object({
    seeded: v.boolean(),
    userId: v.string(),
    accountId: v.string(),
    accountIdField: v.string(),
    passwordHash: v.string(),
  }),
  handler: async (ctx) => {
    const password = "hunter2";
    const passwordHash = await hashPassword(password);
    const email = "demo-credential@example.com";
    const accountIdField = crypto.randomUUID();
    const sessionToken = crypto.randomUUID();

    const user = await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "user",
        data: {
          name: "Demo User",
          email,
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
          accountId: accountIdField,
          providerId: "credential",
          password: passwordHash,
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
          token: sessionToken,
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
      accountIdField,
      passwordHash,
    };
  },
});
