import { action, mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { processConvexWebhookDelivery } from "@vortex-api/convex-auth/convex";
import { api, components } from "./_generated/api";

const webhookStatusValidator = v.union(
  v.literal("active"),
  v.literal("disabled"),
  v.literal("archived"),
);

const endpointStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("delivered"),
  v.literal("failed"),
);

function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function secretPreview(): string {
  return "••••••••";
}

const webhookEndpointListItemValidator = v.object({
  _id: v.string(),
  url: v.string(),
  description: v.optional(v.string()),
  status: webhookStatusValidator,
  events: v.array(v.string()),
  secretPreview: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

type WebhookDeliveryFailureKind =
  | "endpoint_inactive"
  | "network_error"
  | "rate_limited"
  | "server_error"
  | "client_error"
  | "unknown_error";

const webhookDeliveryItemValidator = v.object({
  _id: v.string(),
  endpointId: v.string(),
  organizationId: v.string(),
  eventId: v.string(),
  eventType: v.string(),
  payload: v.string(),
  status: endpointStatusValidator,
  attemptCount: v.number(),
  nextAttemptAt: v.optional(v.number()),
  lastAttemptAt: v.optional(v.number()),
  deliveredAt: v.optional(v.number()),
  exhaustedAt: v.optional(v.number()),
  recoveredAt: v.optional(v.number()),
  recoveryCount: v.optional(v.number()),
  responseStatus: v.optional(v.number()),
  responseBody: v.optional(v.string()),
  failureKind: v.optional(
    v.union(
      v.literal("endpoint_inactive"),
      v.literal("network_error"),
      v.literal("rate_limited"),
      v.literal("server_error"),
      v.literal("client_error"),
      v.literal("unknown_error"),
    ),
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
  endpointUrl: v.optional(v.string()),
  endpointDescription: v.optional(v.string()),
});

const webhookDeliveryPageValidator = v.object({
  items: v.array(webhookDeliveryItemValidator),
  total: v.number(),
  offset: v.number(),
  limit: v.number(),
  hasMore: v.boolean(),
});

async function getActiveOrganizationId(
  ctx: Pick<QueryCtx, "auth" | "runQuery">,
): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const user = await ctx.runQuery(components.convexAuth.native.users.getUserById, {
    userId: identity.subject,
  });
  return user?.activeOrganizationId ?? null;
}

async function requireActiveOrganizationId(
  ctx: Pick<QueryCtx, "auth" | "runQuery">,
): Promise<string> {
  const organizationId = await getActiveOrganizationId(ctx);
  if (!organizationId) throw new Error("No active workspace");
  return organizationId;
}

function emptyDeliveryPage(limit = 10, offset = 0) {
  return {
    items: [],
    total: 0,
    offset,
    limit,
    hasMore: false,
  };
}

function toDeliveryItem(
  delivery: {
    _id: string;
    endpointId: string;
    eventId: string;
    eventType: string;
    payloadJson: string;
    status: "pending" | "processing" | "delivered" | "failed";
    attemptCount: number;
    nextAttemptAt?: number | null;
    responseStatus?: number | null;
    responseBody?: string | null;
    failureKind?: WebhookDeliveryFailureKind | null;
    deliveredAt?: number | null;
    exhaustedAt?: number | null;
    createdAt: number;
    updatedAt: number;
  },
  endpoint?: {
    _id: string;
    organizationId?: string | null;
    url: string;
    description?: string | null;
  },
) {
  return {
    _id: delivery._id,
    endpointId: delivery.endpointId,
    organizationId: endpoint?.organizationId ?? "",
    eventId: delivery.eventId,
    eventType: delivery.eventType,
    payload: delivery.payloadJson,
    status: delivery.status,
    attemptCount: delivery.attemptCount,
    nextAttemptAt: delivery.nextAttemptAt ?? undefined,
    lastAttemptAt: delivery.updatedAt,
    deliveredAt: delivery.deliveredAt ?? undefined,
    exhaustedAt: delivery.exhaustedAt ?? undefined,
    responseStatus: delivery.responseStatus ?? undefined,
    responseBody: delivery.responseBody ?? undefined,
    failureKind: delivery.failureKind ?? undefined,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
    endpointUrl: endpoint?.url,
    endpointDescription: endpoint?.description ?? undefined,
  };
}

export const listEndpoints = query({
  args: {},
  returns: v.array(webhookEndpointListItemValidator),
  handler: async (ctx) => {
    const organizationId = await getActiveOrganizationId(ctx);
    if (!organizationId) return [];
    const endpoints = await ctx.runQuery(
      components.convexAuth.webhooks.listWebhookEndpointsByOrganization,
      { organizationId, limit: 100 },
    );
    return endpoints.map((endpoint) => ({
      _id: endpoint._id,
      url: endpoint.url,
      description: endpoint.description,
      status: endpoint.status,
      events: endpoint.eventTypes,
      secretPreview: secretPreview(),
      createdAt: endpoint.createdAt,
      updatedAt: endpoint.updatedAt,
    }));
  },
});

export const createEndpoint = mutation({
  args: {
    url: v.string(),
    description: v.optional(v.string()),
    events: v.array(v.string()),
    requestId: v.optional(v.string()),
  },
  returns: v.object({ secret: v.string() }),
  handler: async (ctx, { url, description, events }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("UNAUTHORIZED");
    const userId = identity.subject;
    const user = await ctx.runQuery(components.convexAuth.native.users.getUserById, { userId });
    const organizationId = user?.activeOrganizationId;
    if (!organizationId) throw new Error("No active workspace");
    const secret = generateSecret();
    await ctx.runMutation(components.convexAuth.webhooks.createWebhookEndpoint, {
      organizationId,
      url,
      description,
      eventTypes: events,
      secret,
      createdBy: userId,
    });
    return { secret };
  },
});

export const updateEndpoint = mutation({
  args: {
    endpointId: v.string(),
    url: v.string(),
    description: v.optional(v.string()),
    events: v.array(v.string()),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, { endpointId, url, description, events }) => {
    const organizationId = await requireActiveOrganizationId(ctx);
    await ctx.runMutation(components.convexAuth.webhooks.updateWebhookEndpoint, {
      endpointId,
      organizationId,
      url,
      description,
      eventTypes: events,
    });
    return { ok: true as const };
  },
});

export const rotateEndpointSecret = mutation({
  args: {
    endpointId: v.string(),
  },
  returns: v.object({ secret: v.string() }),
  handler: async (ctx, { endpointId }) => {
    const organizationId = await requireActiveOrganizationId(ctx);
    const secret = generateSecret();
    await ctx.runMutation(components.convexAuth.webhooks.rotateWebhookEndpointSecret, {
      endpointId,
      organizationId,
      secret,
    });
    return { secret };
  },
});

export const disableEndpoint = mutation({
  args: { endpointId: v.string() },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, { endpointId }) => {
    const organizationId = await requireActiveOrganizationId(ctx);
    await ctx.runMutation(components.convexAuth.webhooks.setWebhookEndpointStatus, {
      endpointId,
      organizationId,
      status: "disabled",
    });
    return { ok: true as const };
  },
});

export const archiveEndpoint = mutation({
  args: { endpointId: v.string() },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, { endpointId }) => {
    const organizationId = await requireActiveOrganizationId(ctx);
    await ctx.runMutation(components.convexAuth.webhooks.setWebhookEndpointStatus, {
      endpointId,
      organizationId,
      status: "archived",
    });
    return { ok: true as const };
  },
});

export const removeEndpoint = mutation({
  args: { endpointId: v.string() },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, { endpointId }) => {
    const organizationId = await requireActiveOrganizationId(ctx);
    const endpoint = await ctx.runQuery(components.convexAuth.webhooks.getWebhookEndpoint, {
      endpointId,
    });
    if (!endpoint || endpoint.organizationId !== organizationId) {
      throw new Error("Webhook endpoint not found");
    }
    if (endpoint.status !== "archived") {
      await ctx.runMutation(components.convexAuth.webhooks.setWebhookEndpointStatus, {
        endpointId,
        organizationId,
        status: "archived",
      });
    }
    await ctx.runMutation(components.convexAuth.webhooks.deleteWebhookEndpoint, {
      endpointId,
      organizationId,
    });
    return { ok: true as const };
  },
});

export const sendTest = mutation({
  args: { endpointId: v.string(), requestId: v.optional(v.string()) },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, { endpointId, requestId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("UNAUTHORIZED");
    await ctx.runMutation(components.convexAuth.webhooks.createWebhookDelivery, {
      endpointId,
      eventId: requestId ?? `test-${Date.now()}`,
      eventType: "test",
      payloadJson: JSON.stringify({ test: true }),
    });
    return { ok: true as const };
  },
});

export const listRecentDeliveries = query({
  args: {
    endpointId: v.optional(v.string()),
    eventType: v.optional(v.string()),
    status: v.optional(endpointStatusValidator),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  returns: webhookDeliveryPageValidator,
  handler: async (ctx, { endpointId, eventType, status, limit, offset }) => {
    const organizationId = await getActiveOrganizationId(ctx);
    if (!organizationId) return emptyDeliveryPage(limit ?? 10, offset ?? 0);

    const resolvedLimit = limit ?? 10;
    const resolvedOffset = offset ?? 0;
    const endpoints = endpointId
      ? [await ctx.runQuery(components.convexAuth.webhooks.getWebhookEndpoint, { endpointId })]
      : await ctx.runQuery(components.convexAuth.webhooks.listWebhookEndpointsByOrganization, {
          organizationId,
          limit: 100,
        });

    const validEndpoints = endpoints.filter(
      (e): e is NonNullable<typeof e> => e !== null && String(e.organizationId) === organizationId,
    );
    const endpointMap = new Map(validEndpoints.map((e) => [e._id, e]));
    const items: ReturnType<typeof toDeliveryItem>[] = [];
    for (const endpoint of validEndpoints) {
      const deliveries = await ctx.runQuery(
        components.convexAuth.webhooks.listWebhookDeliveriesByEndpoint,
        { endpointId: endpoint._id, status, limit: 1000 },
      );
      for (const delivery of deliveries) {
        if (eventType && delivery.eventType !== eventType) continue;
        items.push(toDeliveryItem(delivery, endpointMap.get(delivery.endpointId)));
      }
    }
    items.sort((a, b) => b.createdAt - a.createdAt);
    const total = items.length;
    const page = items.slice(resolvedOffset, resolvedOffset + resolvedLimit);
    return {
      items: page,
      total,
      offset: resolvedOffset,
      limit: resolvedLimit,
      hasMore: resolvedOffset + page.length < total,
    };
  },
});

export const listExhaustedDeliveries = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(webhookDeliveryItemValidator),
  handler: async (ctx, { limit }) => {
    const organizationId = await getActiveOrganizationId(ctx);
    if (!organizationId) return [];

    const resolvedLimit = limit ?? 10;
    const endpoints = await ctx.runQuery(
      components.convexAuth.webhooks.listWebhookEndpointsByOrganization,
      { organizationId, limit: 100 },
    );
    const items: ReturnType<typeof toDeliveryItem>[] = [];
    for (const endpoint of endpoints) {
      const deliveries = await ctx.runQuery(
        components.convexAuth.webhooks.listWebhookDeliveriesByEndpoint,
        { endpointId: endpoint._id, status: "failed", limit: 1000 },
      );
      for (const delivery of deliveries) {
        if (delivery.exhaustedAt != null) {
          items.push(toDeliveryItem(delivery, endpoint));
        }
      }
    }
    items.sort((a, b) => (b.exhaustedAt ?? 0) - (a.exhaustedAt ?? 0));
    return items.slice(0, resolvedLimit);
  },
});

export const retryDelivery = mutation({
  args: { deliveryId: v.string() },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, { deliveryId }) => {
    const delivery = await ctx.runQuery(components.convexAuth.webhooks.getWebhookDelivery, {
      deliveryId,
    });
    if (!delivery) throw new Error("Webhook delivery not found");
    const endpoint = await ctx.runQuery(components.convexAuth.webhooks.getWebhookEndpoint, {
      endpointId: delivery.endpointId,
    });
    if (!endpoint || String(endpoint.organizationId) !== (await getActiveOrganizationId(ctx))) {
      throw new Error("Webhook endpoint not found");
    }
    const now = Date.now();
    await ctx.runMutation(components.convexAuth.webhooks.updateWebhookDelivery, {
      deliveryId,
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: now,
      updatedAt: now,
      responseStatus: null,
      responseBody: null,
      failureKind: null,
      deliveredAt: null,
      exhaustedAt: null,
    });
    return { ok: true as const };
  },
});

export const triggerProcessing = mutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, { limit }) => {
    await ctx.scheduler.runAfter(0, api.webhooks.processWebhookQueue, {
      limit: limit ?? 10,
    });
    return { ok: true as const };
  },
});

export const processWebhookQueue = action({
  args: { limit: v.number() },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, { limit }) => {
    const now = Date.now();
    const deliveries = await ctx.runQuery(
      components.convexAuth.webhooks.listPendingWebhookDeliveries,
      { limit, beforeNextAttemptAt: now },
    );

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
    }
    return { ok: true as const };
  },
});
