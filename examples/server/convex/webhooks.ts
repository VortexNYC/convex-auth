import { internalAction, internalMutation, mutation, query } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { v } from "convex/values";
import { processConvexWebhookDelivery } from "@vortex-api/convex-auth/convex";
import { requireCaller, requireProofCaller } from "./authz";

function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/* Global endpoint (organizationId omitted) — subscribes to every event. */
export const createEndpoint = mutation({
  args: {
    url: v.string(),
    eventTypes: v.array(v.string()),
    secret: v.optional(v.string()),
  },
  returns: v.object({ endpointId: v.string(), secret: v.string() }),
  handler: async (ctx, args) => {
    const callerId = await requireProofCaller(ctx);
    const secret = args.secret ?? generateWebhookSecret();
    const result = await ctx.runMutation(components.convexAuth.webhooks.createWebhookEndpoint, {
      url: args.url,
      eventTypes: args.eventTypes,
      secret,
      createdBy: callerId,
    });
    return { endpointId: result.endpointId, secret };
  },
});

export const setEndpointStatus = mutation({
  args: {
    endpointId: v.string(),
    status: v.union(v.literal("active"), v.literal("disabled"), v.literal("archived")),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await requireProofCaller(ctx);
    await ctx.runMutation(components.convexAuth.webhooks.setGlobalWebhookEndpointStatus, {
      endpointId: args.endpointId,
      status: args.status,
    });
    return { ok: true as const };
  },
});

export const enqueueEvent = mutation({
  args: {
    eventType: v.string(),
    payloadJson: v.string(),
    organizationId: v.optional(v.string()),
  },
  returns: v.object({
    eventId: v.string(),
    enqueued: v.number(),
    deliveryIds: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    await requireProofCaller(ctx);
    const eventId = `evt_${crypto.randomUUID()}`;
    const result = await ctx.runMutation(components.convexAuth.webhooks.enqueueWebhookEvent, {
      eventType: args.eventType,
      eventId,
      payloadJson: args.payloadJson,
      organizationId: args.organizationId,
    });
    return {
      eventId: result.eventId,
      enqueued: result.enqueued,
      deliveryIds: result.deliveryIds,
    };
  },
});

export const kickProcessing = mutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await requireProofCaller(ctx);
    await ctx.scheduler.runAfter(0, internal.webhooks.processWebhookQueue, {
      limit: args.limit ?? 10,
    });
    return { ok: true as const };
  },
});

export const processWebhookQueue = internalAction({
  args: { limit: v.number() },
  returns: v.object({ processed: v.number() }),
  handler: async (ctx, { limit }) => {
    const now = Date.now();
    const deliveries = await ctx.runQuery(
      components.convexAuth.webhooks.listPendingWebhookDeliveries,
      { limit, beforeNextAttemptAt: now },
    );

    let processed = 0;
    for (const delivery of deliveries) {
      const { claimed } = await ctx.runMutation(
        components.convexAuth.webhooks.claimWebhookDelivery,
        { deliveryId: delivery._id },
      );
      if (!claimed) continue;

      const endpoint = await ctx.runQuery(
        components.convexAuth.webhooks.getWebhookEndpointWithSecret,
        { endpointId: delivery.endpointId },
      );

      const result = await processConvexWebhookDelivery({
        endpoint: endpoint
          ? {
              _id: endpoint._id,
              url: endpoint.url,
              secret: endpoint.secret,
              status: endpoint.status,
            }
          : null,
        delivery: {
          _id: delivery._id,
          endpointId: delivery.endpointId,
          eventId: delivery.eventId,
          eventType: delivery.eventType,
          payloadJson: delivery.payloadJson,
          attemptCount: delivery.attemptCount,
          deliveredAt: delivery.deliveredAt ?? undefined,
        },
        fetch: async (url, init) => {
          const response = await fetch(url, init);
          return { status: response.status, text: () => response.text() };
        },
        now,
      });

      await ctx.runMutation(components.convexAuth.webhooks.updateWebhookDelivery, {
        deliveryId: delivery._id,
        ...result.update,
      });
      processed += 1;
    }
    return { processed };
  },
});

/* Proof hygiene: wipe sink rows and archive+delete every global endpoint the
 * fixture created, so repeated runs fan out to exactly the endpoints created
 * in this run. Org-scoped endpoints are unreachable here by design. */
export const resetProofState = mutation({
  args: {},
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx) => {
    await requireProofCaller(ctx);
    const rows = await ctx.db.query("webhookSink").take(500);
    for (const row of rows) {
      await ctx.db.delete("webhookSink", row._id);
    }
    const endpoints = await ctx.runQuery(
      components.convexAuth.webhooks.listGlobalWebhookEndpoints,
      {},
    );
    for (const endpoint of endpoints) {
      if (endpoint.status !== "archived") {
        await ctx.runMutation(components.convexAuth.webhooks.setGlobalWebhookEndpointStatus, {
          endpointId: endpoint._id,
          status: "archived",
        });
      }
      await ctx.runMutation(components.convexAuth.webhooks.deleteGlobalWebhookEndpoint, {
        endpointId: endpoint._id,
      });
    }
    return { ok: true as const };
  },
});

export const insertSinkRow = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    deliveryHeader: v.optional(v.string()),
    signature: v.optional(v.string()),
    bodyJson: v.string(),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await ctx.db.insert("webhookSink", {
      eventId: args.eventId,
      eventType: args.eventType,
      deliveryHeader: args.deliveryHeader,
      signature: args.signature,
      bodyJson: args.bodyJson,
      receivedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const listSinkRows = query({
  args: { eventId: v.string(), limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("webhookSink"),
      _creationTime: v.number(),
      eventId: v.string(),
      eventType: v.string(),
      deliveryHeader: v.optional(v.string()),
      signature: v.optional(v.string()),
      bodyJson: v.string(),
      receivedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireCaller(ctx);
    return await ctx.db
      .query("webhookSink")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(args.limit ?? 20);
  },
});

export const getDelivery = query({
  args: { deliveryId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      status: v.string(),
      attemptCount: v.number(),
      responseStatus: v.optional(v.number()),
      failureKind: v.optional(v.string()),
      nextAttemptAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireCaller(ctx);
    const delivery = await ctx.runQuery(components.convexAuth.webhooks.getWebhookDelivery, {
      deliveryId: args.deliveryId,
    });
    if (delivery === null) return null;
    return {
      status: delivery.status,
      attemptCount: delivery.attemptCount,
      responseStatus: delivery.responseStatus,
      failureKind: delivery.failureKind,
      nextAttemptAt: delivery.nextAttemptAt,
    };
  },
});
