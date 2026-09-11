import { query, mutation, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { components } from "./_generated/api";

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
  failureKind: v.optional(v.string()),
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
  handler: async (_, { limit, offset }) => {
    return emptyDeliveryPage(limit ?? 10, offset ?? 0);
  },
});

export const listExhaustedDeliveries = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(webhookDeliveryItemValidator),
  handler: async () => {
    return [];
  },
});

export const retryDelivery = mutation({
  args: { deliveryId: v.string() },
  returns: v.object({ ok: v.literal(true) }),
  handler: async () => {
    return { ok: true as const };
  },
});

export const triggerProcessing = mutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ ok: v.literal(true) }),
  handler: async () => {
    return { ok: true as const };
  },
});
