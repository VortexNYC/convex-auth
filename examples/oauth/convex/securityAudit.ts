import { query } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";
import { requireCaller, requireOrganizationMembership } from "./authz";

export const list = query({
  args: {
    organizationId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const callerId = await requireCaller(ctx);
    const organizationId = args.organizationId;
    if (organizationId === undefined) {
      throw new Error("Organization required");
    }
    await requireOrganizationMembership(ctx, callerId, organizationId);

    return await ctx.runQuery(components.convexAuth.native.audit.listAuthAuditEvents, {
      organizationId,
      limit: args.limit,
    });
  },
});
