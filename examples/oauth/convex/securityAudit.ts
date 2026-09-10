import { query } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";

export const list = query({
  args: {
    organizationId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.convexAuth.native.audit.listAuthAuditEvents, {
      organizationId: args.organizationId,
      limit: args.limit,
    });
  },
});
