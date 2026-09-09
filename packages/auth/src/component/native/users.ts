import { v } from "convex/values";
import { getOneFrom } from "convex-helpers/server/relationships";
import { mutation, query } from "../_generated/server.js";

export const getUserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await getOneFrom(ctx.db, "users", "by_email", args.email.toLowerCase().trim());
  },
});

export const getUserById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get("users", args.userId);
  },
});

export const markEmailVerified = mutation({
  args: {
    userId: v.id("users"),
    emailVerified: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.userId, {
      emailVerified: args.emailVerified,
      updatedAt: now,
    });
  },
});

export const setTwoFactor = mutation({
  args: {
    userId: v.id("users"),
    twoFactorEnabled: v.boolean(),
    twoFactorSecret: v.optional(v.string()),
    twoFactorBackupCodes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const patch: {
      twoFactorEnabled: boolean;
      twoFactorSecret?: string;
      twoFactorBackupCodes?: string[];
      updatedAt: number;
    } = {
      twoFactorEnabled: args.twoFactorEnabled,
      twoFactorSecret: args.twoFactorSecret,
      twoFactorBackupCodes: args.twoFactorBackupCodes,
      updatedAt: now,
    };
    if (args.twoFactorSecret === undefined) {
      patch.twoFactorSecret = undefined;
    }
    if (args.twoFactorBackupCodes === undefined) {
      patch.twoFactorBackupCodes = undefined;
    }
    await ctx.db.patch(args.userId, patch);
  },
});

export const updateUser = mutation({
  args: {
    userId: v.id("users"),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    metadataJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const patch: {
      name?: string;
      image?: string;
      metadataJson?: string;
      updatedAt: number;
    } = { updatedAt: now };
    if (args.name !== undefined) patch.name = args.name;
    if (args.image !== undefined) patch.image = args.image;
    if (args.metadataJson !== undefined) patch.metadataJson = args.metadataJson;
    await ctx.db.patch(args.userId, patch);
  },
});

export const consumeBackupCode = mutation({
  args: {
    userId: v.id("users"),
    backupCodeHash: v.string(),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user) {
      return { success: false };
    }
    const codes = user.twoFactorBackupCodes ?? [];
    const index = codes.indexOf(args.backupCodeHash);
    if (index < 0) {
      return { success: false };
    }
    const next = codes.slice();
    next.splice(index, 1);
    await ctx.db.patch(args.userId, {
      twoFactorBackupCodes: next,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});
