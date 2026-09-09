import { query, mutation } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";

export const list = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.convexAuth.native.sessions.listSessionsByUser, {
      userId: args.userId,
    });
  },
});

export const revoke = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.convexAuth.native.sessions.revokeSession, {
      sessionId: args.sessionId,
    });
  },
});
