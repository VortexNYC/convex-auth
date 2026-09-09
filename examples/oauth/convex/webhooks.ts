import { query, mutation } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";
import type { GenericQueryCtx, AnyDataModel } from "convex/server";

type Ctx = GenericQueryCtx<AnyDataModel>;

type DeliveryItem = {
  _id: string;
  endpointId: string;
  eventId: string;
  eventType: string;
  payloadJson: string;
  status: "pending" | "processing" | "delivered" | "failed";
  attemptCount: number;
  nextAttemptAt?: number;
  responseStatus?: number;
  responseBody?: string;
  failureKind?:
    | "endpoint_inactive"
    | "network_error"
    | "rate_limited"
    | "server_error"
    | "client_error"
    | "unknown_error";
  deliveredAt?: number;
  exhaustedAt?: number;
  createdAt: number;
  updatedAt: number;
};

type EndpointItem = {
  _id: string;
  url: string;
  description?: string;
  eventTypes: string[];
  status: "active" | "disabled" | "archived";
  secret: string;
  createdAt: number;
  updatedAt: number;
  organizationId?: string;
};

async function getEndpoint(ctx: Ctx, endpointId: string): Promise<EndpointItem | null> {
  const endpoint = await ctx.runQuery(components.convexAuth.webhooks.getWebhookEndpoint, {
    endpointId,
  });
  if (endpoint === null) return null;
  return {
    _id: endpoint._id,
    url: endpoint.url,
    description: endpoint.description,
    eventTypes: endpoint.eventTypes,
    status: endpoint.status,
    secret: "",
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
    organizationId: endpoint.organizationId,
  };
}

async function getEndpointWithSecret(ctx: Ctx, endpointId: string): Promise<EndpointItem | null> {
  const endpoint = await ctx.runQuery(components.convexAuth.webhooks.getWebhookEndpointWithSecret, {
    endpointId,
  });
  if (endpoint === null) return null;
  return {
    _id: endpoint._id,
    url: endpoint.url,
    description: endpoint.description,
    eventTypes: endpoint.eventTypes,
    status: endpoint.status,
    secret: endpoint.secret,
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
    organizationId: endpoint.organizationId,
  };
}

function normalizeEventTypes(eventTypes: string[]): string[] {
  const normalized = eventTypes.map((t) => t.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : ["*"];
}

function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getSecretPreview(secret: string): string {
  if (secret.length >= 16) {
    return `${secret.slice(0, 10)}...${secret.slice(-6)}`;
  }
  return `${secret.slice(0, 3)}...`;
}

function mapDelivery(
  delivery: DeliveryItem,
  endpointsMap: Map<string, { url: string; description?: string; organizationId?: string }>,
) {
  const endpoint = endpointsMap.get(delivery.endpointId);
  return {
    _id: delivery._id,
    endpointId: delivery.endpointId,
    organizationId: endpoint?.organizationId ?? "",
    eventId: delivery.eventId,
    eventType: delivery.eventType,
    payload: delivery.payloadJson,
    status: delivery.status,
    attemptCount: delivery.attemptCount,
    nextAttemptAt: delivery.nextAttemptAt,
    responseStatus: delivery.responseStatus,
    responseBody: delivery.responseBody,
    failureKind: delivery.failureKind,
    deliveredAt: delivery.deliveredAt,
    exhaustedAt: delivery.exhaustedAt,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
    endpointUrl: endpoint?.url,
    endpointDescription: endpoint?.description,
  };
}

async function buildEndpointsMap(
  ctx: Ctx,
  organizationId: string,
): Promise<Map<string, { url: string; description?: string; organizationId?: string }>> {
  const endpoints = await ctx.runQuery(
    components.convexAuth.webhooks.listWebhookEndpointsByOrganization,
    { organizationId },
  );
  const map = new Map<string, { url: string; description?: string; organizationId?: string }>();
  for (const endpoint of endpoints) {
    map.set(endpoint._id, {
      url: endpoint.url,
      description: endpoint.description,
      organizationId: endpoint.organizationId,
    });
  }
  return map;
}

export const listEndpoints = query({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    const endpoints = await ctx.runQuery(
      components.convexAuth.webhooks.listWebhookEndpointsByOrganization,
      { organizationId: args.organizationId },
    );

    const withSecrets: EndpointItem[] = [];
    for (const endpoint of endpoints) {
      const full = await getEndpointWithSecret(ctx, endpoint._id);
      if (full !== null) {
        withSecrets.push(full);
      }
    }

    return withSecrets.map((endpoint) => ({
      _id: endpoint._id,
      url: endpoint.url,
      description: endpoint.description,
      status: endpoint.status,
      events: endpoint.eventTypes,
      secretPreview: getSecretPreview(endpoint.secret),
      createdAt: endpoint.createdAt,
      updatedAt: endpoint.updatedAt,
    }));
  },
});

export const listRecentDeliveries = query({
  args: {
    organizationId: v.string(),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 10;

    const endpointsMap = await buildEndpointsMap(ctx, args.organizationId);
    let deliveries: DeliveryItem[] = [];

    for (const endpointId of endpointsMap.keys()) {
      const endpointDeliveries = await ctx.runQuery(
        components.convexAuth.webhooks.listWebhookDeliveriesByEndpoint,
        { endpointId, limit: 100 },
      );
      deliveries.push(...endpointDeliveries);
    }

    deliveries.sort((a, b) => b.createdAt - a.createdAt);
    return deliveries
      .slice(offset, offset + limit)
      .map((delivery) => mapDelivery(delivery, endpointsMap));
  },
});

export const listExhaustedDeliveries = query({
  args: {
    organizationId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const endpointsMap = await buildEndpointsMap(ctx, args.organizationId);
    let deliveries: DeliveryItem[] = [];

    for (const endpointId of endpointsMap.keys()) {
      const endpointDeliveries = await ctx.runQuery(
        components.convexAuth.webhooks.listWebhookDeliveriesByEndpoint,
        { endpointId, limit: 100 },
      );
      deliveries.push(...endpointDeliveries);
    }

    return deliveries
      .filter((d) => d.status === "failed" && d.exhaustedAt !== undefined)
      .sort((a, b) => (b.exhaustedAt ?? 0) - (a.exhaustedAt ?? 0))
      .slice(0, args.limit ?? 10)
      .map((delivery) => mapDelivery(delivery, endpointsMap));
  },
});

export const createEndpoint = mutation({
  args: {
    organizationId: v.string(),
    userId: v.optional(v.string()),
    url: v.string(),
    description: v.optional(v.string()),
    events: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const secret = generateWebhookSecret();
    await ctx.runMutation(components.convexAuth.webhooks.createWebhookEndpoint, {
      organizationId: args.organizationId,
      url: args.url,
      description: args.description,
      eventTypes: normalizeEventTypes(args.events),
      secret,
      createdBy: args.userId,
    });

    return { secret };
  },
});

export const updateEndpoint = mutation({
  args: {
    organizationId: v.string(),
    endpointId: v.string(),
    url: v.string(),
    description: v.optional(v.string()),
    events: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(components.convexAuth.webhooks.updateWebhookEndpoint, {
      endpointId: args.endpointId,
      organizationId: args.organizationId,
      url: args.url,
      description: args.description,
      eventTypes: normalizeEventTypes(args.events),
    });
  },
});

export const archiveEndpoint = mutation({
  args: { organizationId: v.string(), endpointId: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(components.convexAuth.webhooks.setWebhookEndpointStatus, {
      endpointId: args.endpointId,
      organizationId: args.organizationId,
      status: "archived",
    });
  },
});

export const disableEndpoint = mutation({
  args: { organizationId: v.string(), endpointId: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(components.convexAuth.webhooks.setWebhookEndpointStatus, {
      endpointId: args.endpointId,
      organizationId: args.organizationId,
      status: "disabled",
    });
  },
});

export const removeEndpoint = mutation({
  args: { organizationId: v.string(), endpointId: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(components.convexAuth.webhooks.deleteWebhookEndpoint, {
      endpointId: args.endpointId,
      organizationId: args.organizationId,
    });
  },
});

export const rotateEndpointSecret = mutation({
  args: { organizationId: v.string(), endpointId: v.string() },
  handler: async (ctx, args) => {
    const secret = generateWebhookSecret();
    await ctx.runMutation(components.convexAuth.webhooks.rotateWebhookEndpointSecret, {
      endpointId: args.endpointId,
      organizationId: args.organizationId,
      secret,
    });

    return { secret };
  },
});

export const sendTest = mutation({
  args: {
    organizationId: v.string(),
    endpointId: v.string(),
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const endpoint = await getEndpoint(ctx, args.endpointId);
    if (endpoint === null) throw new Error("Endpoint not found");

    const eventId = args.requestId ?? crypto.randomUUID();
    await ctx.runMutation(components.convexAuth.webhooks.createWebhookDelivery, {
      endpointId: args.endpointId,
      eventId,
      eventType: "test.event",
      payloadJson: JSON.stringify({ test: true, endpointUrl: endpoint.url }),
    });
  },
});

export const retryDelivery = mutation({
  args: { organizationId: v.string(), deliveryId: v.string() },
  handler: async (ctx, args) => {
    const delivery = await ctx.runQuery(components.convexAuth.webhooks.getWebhookDelivery, {
      deliveryId: args.deliveryId,
    });
    if (delivery === null) throw new Error("Delivery not found");

    const endpoint = await getEndpoint(ctx, delivery.endpointId);
    if (endpoint === null || endpoint.organizationId !== args.organizationId) {
      throw new Error("Delivery does not belong to this organization");
    }

    await ctx.runMutation(components.convexAuth.webhooks.updateWebhookDelivery, {
      deliveryId: args.deliveryId,
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: null,
      responseStatus: null,
      responseBody: null,
      failureKind: null,
      deliveredAt: null,
      exhaustedAt: null,
      updatedAt: Date.now(),
    });
  },
});

export const triggerProcessing = mutation({
  args: { organizationId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const endpoints = await ctx.runQuery(
      components.convexAuth.webhooks.listWebhookEndpointsByOrganization,
      { organizationId: args.organizationId },
    );

    const limit = args.limit ?? 20;
    let processed = 0;
    const now = Date.now();

    for (const endpoint of endpoints) {
      if (processed >= limit) break;
      const deliveries = await ctx.runQuery(
        components.convexAuth.webhooks.listWebhookDeliveriesByEndpoint,
        { endpointId: endpoint._id, limit: 50 },
      );

      for (const delivery of deliveries) {
        if (delivery.status !== "pending") continue;

        await ctx.runMutation(components.convexAuth.webhooks.updateWebhookDelivery, {
          deliveryId: delivery._id,
          status: "failed",
          attemptCount: 1,
          nextAttemptAt: null,
          responseStatus: 0,
          responseBody: "Demo processing did not perform an outbound request.",
          failureKind: "unknown_error",
          deliveredAt: null,
          exhaustedAt: now,
          updatedAt: now,
        });

        processed++;
        if (processed >= limit) break;
      }
    }

    return null;
  },
});
