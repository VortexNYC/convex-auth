import { paginator } from "convex-helpers/server/pagination";
import { query } from "../_generated/server.js";
import { v } from "convex/values";
import { requireSuperAdmin } from "../../convex-runtime/admin/admin.js";
import schema from "../schema.js";
import type { Doc } from "../_generated/dataModel.js";

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

function matchesAuditFilters(
  audit: Doc<"auth_admin_audits">,
  filters: {
    action?: string;
    targetType?: string;
    targetId?: string;
    adminId?: string;
    from?: number;
    to?: number;
  },
): boolean {
  if (filters.action && !audit.action.toLowerCase().includes(filters.action.toLowerCase())) {
    return false;
  }
  if (
    filters.targetType &&
    !audit.targetType.toLowerCase().includes(filters.targetType.toLowerCase())
  ) {
    return false;
  }
  if (filters.targetId && !audit.targetId.toLowerCase().includes(filters.targetId.toLowerCase())) {
    return false;
  }
  if (filters.adminId && String(audit.adminId).toLowerCase() !== filters.adminId.toLowerCase()) {
    return false;
  }
  if (filters.from !== undefined && audit.createdAt < filters.from) {
    return false;
  }
  if (filters.to !== undefined && audit.createdAt > filters.to) {
    return false;
  }
  return true;
}

export const listAdminAudits = query({
  args: {
    action: v.optional(v.string()),
    targetType: v.optional(v.string()),
    targetId: v.optional(v.string()),
    adminId: v.optional(v.string()),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
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
    const filters = {
      action: args.action?.trim() || undefined,
      targetType: args.targetType?.trim() || undefined,
      targetId: args.targetId?.trim() || undefined,
      adminId: args.adminId?.trim() || undefined,
      from: args.from,
      to: args.to,
    };

    const { page, continueCursor, isDone } = await paginator(ctx.db, schema)
      .query("auth_admin_audits")
      .order("desc")
      .filterWith(async (audit) => matchesAuditFilters(audit, filters))
      .paginate({
        cursor: args.cursor ?? null,
        numItems: limit,
        maximumRowsRead: Math.max(limit * 20, 1000),
      });

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
