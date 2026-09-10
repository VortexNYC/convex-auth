import { query, mutation } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";
import { requireMatchingUserId } from "./authz";

export const list = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    await requireMatchingUserId(ctx, args.userId);
    return await ctx.runQuery(components.convexAuth.native.sessions.listSessionsByUser, {
      userId: args.userId,
    });
  },
});

export const revoke = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const callerId = (await ctx.auth.getUserIdentity())?.subject;
    if (callerId === undefined) {
      throw new Error("Authentication required");
    }

    const session = await ctx.runQuery(
      components.convexAuth.native.sessions.getSessionBySessionId,
      { sessionId: args.sessionId },
    );
    if (session === null || session.userId !== callerId) {
      throw new Error("Forbidden");
    }

    return await ctx.runMutation(components.convexAuth.native.sessions.revokeSession, {
      sessionId: args.sessionId,
    });
  },
});
