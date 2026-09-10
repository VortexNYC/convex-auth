import { v } from "convex/values";
import { mutation, query } from "../_generated/server.js";
import { authAuditActorTypeValidator } from "../schema/validators.js";

const CLEANUP_BATCH_SIZE = 250;

const authAuditListItemValidator = v.object({
  _id: v.string(),
  action: v.string(),
  description: v.optional(v.string()),
  resourceType: v.optional(v.string()),
  targetUserEmail: v.optional(v.string()),
  userName: v.optional(v.string()),
  userEmail: v.optional(v.string()),
  ipAddress: v.optional(v.string()),
  userAgent: v.optional(v.string()),
  oldValue: v.optional(v.string()),
  newValue: v.optional(v.string()),
  createdAt: v.number(),
  actor: v.optional(
    v.union(
      v.null(),
      v.object({
        _id: v.string(),
        name: v.optional(v.string()),
        email: v.string(),
      }),
    ),
  ),
});

export const listAuthAuditEvents = query({
  args: {
    organizationId: v.optional(v.id("organizations")),
    limit: v.optional(v.number()),
  },
  returns: v.array(authAuditListItemValidator),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const events =
      args.organizationId === undefined
        ? await ctx.db.query("auth_audit_events").order("desc").take(limit)
        : await ctx.db
            .query("auth_audit_events")
            .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
            .order("desc")
            .take(limit);

    const users = new Map<string, { _id: string; name?: string; email: string } | null>();
    for (const event of events) {
      if (event.actorUserId !== undefined && !users.has(event.actorUserId)) {
        const user = await ctx.db.get("users", event.actorUserId);
        users.set(
          event.actorUserId,
          user === null
            ? null
            : { _id: user._id, name: user.name ?? undefined, email: user.email ?? "" },
        );
      }
    }

    return events.map((event) => ({
      _id: event._id,
      action: event.eventType,
      description: event.metadataJson,
      resourceType: event.targetType,
      targetUserEmail: undefined,
      userName: undefined,
      userEmail: undefined,
      ipAddress: undefined,
      userAgent: undefined,
      oldValue: undefined,
      newValue: undefined,
      createdAt: event.createdAt,
      actor: event.actorUserId === undefined ? null : (users.get(event.actorUserId) ?? null),
    }));
  },
});

export const createAuthAuditEvent = mutation({
  args: {
    actorUserId: v.optional(v.id("users")),
    actorType: authAuditActorTypeValidator,
    eventType: v.string(),
    targetType: v.string(),
    targetId: v.optional(v.string()),
    organizationId: v.optional(v.id("organizations")),
    metadataJson: v.optional(v.string()),
  },
  returns: v.id("auth_audit_events"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("auth_audit_events", {
      actorUserId: args.actorUserId,
      actorType: args.actorType,
      eventType: args.eventType,
      targetType: args.targetType,
      targetId: args.targetId,
      organizationId: args.organizationId,
      metadataJson: args.metadataJson,
      createdAt: Date.now(),
    });
  },
});

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
