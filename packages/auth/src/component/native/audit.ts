import { v } from "convex/values";
import { mutation } from "../_generated/server.js";

const CLEANUP_BATCH_SIZE = 250;

export const cleanupAuthAuditEvents = mutation({
  args: {
    maxAgeMs: v.number(),
    batchSize: v.optional(v.number()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const before = Date.now() - args.maxAgeMs;
    const batchSize = args.batchSize ?? CLEANUP_BATCH_SIZE;
    const stale = await ctx.db
      .query("auth_audit_events")
      .withIndex("by_created_at", (q) => q.lt("createdAt", before))
      .take(batchSize);
    await Promise.all(stale.map((event) => ctx.db.delete(event._id)));
    return stale.length;
  },
});
