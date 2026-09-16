import { paginator } from "convex-helpers/server/pagination";
import { query } from "../_generated/server.js";
import { v } from "convex/values";
import { requireSuperAdmin } from "../../convex-runtime/admin/admin.js";
import schema from "../schema.js";

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
    endCursor: v.optional(v.union(v.string(), v.null())),
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
    const { page, continueCursor, isDone } = await paginator(ctx.db, schema)
      .query("auth_admin_audits")
      .order("desc")
      .paginate({ cursor: args.cursor ?? null, numItems: limit, endCursor: args.endCursor });

    const audits = page.map((audit) => ({
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
      nextCursor: continueCursor,
      hasNextPage: !isDone,
    };
  },
});
