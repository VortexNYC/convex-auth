import { query } from "../_generated/server.js";
import { v } from "convex/values";
import { requireSuperAdmin } from "../../convex-runtime/admin/admin.js";

const MAX_PAGE_LIMIT = 100;

const adminAuditValidator = v.object({
  _id: v.id("auth_admin_audits"),
  adminId: v.id("users"),
  action: v.string(),
  targetType: v.string(),
  targetId: v.string(),
  result: v.string(),
  createdAt: v.number(),
});

export const listAdminAudits = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    audits: v.array(adminAuditValidator),
    nextCursor: v.optional(v.string()),
    hasNextPage: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    await requireSuperAdmin(ctx, identity.subject);

    const requestedLimit = args.limit ?? 20;
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
      throw new Error("limit must be a positive integer");
    }
    const limit = Math.min(requestedLimit, MAX_PAGE_LIMIT);
    const q = ctx.db.query("auth_admin_audits").order("desc");
    const paginated = await q.paginate({ cursor: args.cursor ?? null, numItems: limit });

    const audits = paginated.page.map((audit) => ({
      _id: audit._id,
      adminId: audit.adminId,
      action: audit.action,
      targetType: audit.targetType,
      targetId: audit.targetId,
      result: audit.result,
      createdAt: audit.createdAt,
    }));

    return {
      audits,
      nextCursor: paginated.continueCursor,
      hasNextPage: !paginated.isDone,
    };
  },
});
