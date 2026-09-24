import { v } from "convex/values";
import { getPage } from "convex-helpers/server/pagination";

import type { Doc, Id } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { mutation, query } from "./_generated/server.js";
import {
  webhookEndpointStatusValidator,
  webhookDeliveryStatusValidator,
  webhookFailureKindValidator,
} from "../schema/validators.js";
import schema from "./schema.js";

type DbCtx = Pick<MutationCtx | QueryCtx, "db">;

const webhookEndpointResultValidator = v.object({
  endpointId: v.id("webhook_endpoints"),
  created: v.boolean(),
});

const okResultValidator = v.object({ ok: v.literal(true) });

function okResult() {
  return { ok: true } as const;
}

const webhookEndpointDocValidator = v.object({
  _id: v.id("webhook_endpoints"),
  _creationTime: v.number(),
  organizationId: v.optional(v.id("organizations")),
  url: v.string(),
  description: v.optional(v.string()),
  eventTypes: v.array(v.string()),
  status: webhookEndpointStatusValidator,
  createdBy: v.optional(v.id("users")),
  metadataJson: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const webhookEndpointDocWithSecretValidator = v.object({
  _id: v.id("webhook_endpoints"),
  _creationTime: v.number(),
  organizationId: v.optional(v.id("organizations")),
  url: v.string(),
  description: v.optional(v.string()),
  eventTypes: v.array(v.string()),
  secret: v.string(),
  status: webhookEndpointStatusValidator,
  createdBy: v.optional(v.id("users")),
  metadataJson: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const webhookDeliveryDocValidator = v.object({
  _id: v.id("webhook_deliveries"),
  _creationTime: v.number(),
  endpointId: v.id("webhook_endpoints"),
  eventId: v.string(),
  eventType: v.string(),
  payloadJson: v.string(),
  status: webhookDeliveryStatusValidator,
  attemptCount: v.number(),
  nextAttemptAt: v.optional(v.number()),
  responseStatus: v.optional(v.number()),
  responseBody: v.optional(v.string()),
  failureKind: v.optional(webhookFailureKindValidator),
  deliveredAt: v.optional(v.number()),
  exhaustedAt: v.optional(v.number()),
  metadataJson: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const MAX_ACTIVE_WEBHOOK_ENDPOINTS_PER_SCOPE = 100;

export const createWebhookEndpoint = mutation({
  args: {
    organizationId: v.optional(v.id("organizations")),
    url: v.string(),
    description: v.optional(v.string()),
    eventTypes: v.array(v.string()),
    secret: v.string(),
    createdBy: v.optional(v.id("users")),
    metadataJson: v.optional(v.string()),
    createdAt: v.optional(v.number()),
  },
  returns: webhookEndpointResultValidator,
  handler: async (ctx, args) => {
    const now = args.createdAt ?? Date.now();
    const url = normalizeRequired(args.url, "url");
    const eventTypes = normalizeStringArray(args.eventTypes);
    const secret = normalizeRequired(args.secret, "secret");
    await assertCanActivateWebhookEndpoint(ctx, args.organizationId);

    const endpointId = await ctx.db.insert("webhook_endpoints", {
      organizationId: args.organizationId,
      url,
      description: normalizeOptional(args.description),
      eventTypes,
      secret,
      status: "active",
      createdBy: args.createdBy,
      metadataJson: normalizeOptional(args.metadataJson),
      createdAt: now,
      updatedAt: now,
    });
    return { endpointId, created: true };
  },
});

export const updateWebhookEndpoint = mutation({
  args: {
    endpointId: v.id("webhook_endpoints"),
    organizationId: v.id("organizations"),
    url: v.optional(v.string()),
    description: v.optional(v.string()),
    eventTypes: v.optional(v.array(v.string())),
    metadataJson: v.optional(v.string()),
  },
  returns: okResultValidator,
  handler: async (ctx, args) => {
    const endpoint = await requireWebhookEndpointInOrganization(
      ctx,
      args.endpointId,
      args.organizationId,
    );
    const patch: Partial<Doc<"webhook_endpoints">> = { updatedAt: Date.now() };
    if (args.url !== undefined) {
      patch.url = normalizeRequired(args.url, "url");
    }
    if (args.description !== undefined) {
      patch.description = normalizeOptional(args.description);
    }
    if (args.eventTypes !== undefined) {
      patch.eventTypes = normalizeStringArray(args.eventTypes);
    }
    if (args.metadataJson !== undefined) {
      patch.metadataJson = normalizeOptional(args.metadataJson);
    }
    await ctx.db.patch("webhook_endpoints", endpoint._id, patch);
    return okResult();
  },
});

export const getWebhookEndpoint = query({
  args: {
    endpointId: v.id("webhook_endpoints"),
  },
  returns: v.union(v.null(), webhookEndpointDocValidator),
  handler: async (ctx, { endpointId }) => {
    const endpoint = await ctx.db.get("webhook_endpoints", endpointId);
    if (endpoint === null) return null;
    return {
      _id: endpoint._id,
      _creationTime: endpoint._creationTime,
      organizationId: endpoint.organizationId,
      url: endpoint.url,
      description: endpoint.description,
      eventTypes: endpoint.eventTypes,
      status: endpoint.status,
      createdBy: endpoint.createdBy,
      metadataJson: endpoint.metadataJson,
      createdAt: endpoint.createdAt,
      updatedAt: endpoint.updatedAt,
    };
  },
});

/**
 * SYSTEM-ONLY: returns the signing secret for the trusted delivery worker
 * (which only holds the delivery's endpointId, no org context). Consumers MUST
 * call this only from server-side queue processing, NEVER expose it to tenant
 * principals. Tenant-facing secret exposure is prevented by the guarded
 * mutations (rotate/update) — a tenant never needs the raw secret.
 */
export const getWebhookEndpointWithSecret = query({
  args: {
    endpointId: v.id("webhook_endpoints"),
  },
  returns: v.union(v.null(), webhookEndpointDocWithSecretValidator),
  handler: async (ctx, { endpointId }) => {
    return await ctx.db.get("webhook_endpoints", endpointId);
  },
});

/**
 * `organizationId` is required: an omitted org previously triggered an
 * unindexed full-table scan that returned EVERY tenant's endpoints
 * (cross-tenant enumeration + a Convex cost-guard violation). Tenant
 * isolation is now mandatory.
 */
export const listWebhookEndpointsByOrganization = query({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(webhookEndpointStatusValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(webhookEndpointDocValidator),
  handler: async (ctx, { organizationId, status, limit }) => {
    const resolvedLimit = resolveListLimit(limit);
    const index = status === undefined ? "by_organization" : "by_org_status";
    const startIndexKey = status === undefined ? [organizationId] : [organizationId, status];
    const { page: endpoints } = await getPage(ctx, {
      table: "webhook_endpoints",
      index,
      startIndexKey,
      endIndexKey: startIndexKey,
      absoluteMaxRows: resolvedLimit,
      schema,
    });
    return endpoints.map((endpoint) => ({
      _id: endpoint._id,
      _creationTime: endpoint._creationTime,
      organizationId: endpoint.organizationId,
      url: endpoint.url,
      description: endpoint.description,
      eventTypes: endpoint.eventTypes,
      status: endpoint.status,
      createdBy: endpoint.createdBy,
      metadataJson: endpoint.metadataJson,
      createdAt: endpoint.createdAt,
      updatedAt: endpoint.updatedAt,
    }));
  },
});

export const setWebhookEndpointStatus = mutation({
  args: {
    endpointId: v.id("webhook_endpoints"),
    organizationId: v.id("organizations"),
    status: webhookEndpointStatusValidator,
    updatedAt: v.optional(v.number()),
  },
  returns: okResultValidator,
  handler: async (ctx, args) => {
    const endpoint = await requireWebhookEndpointInOrganization(
      ctx,
      args.endpointId,
      args.organizationId,
    );
    if (endpoint.status === args.status) {
      return okResult();
    }
    if (args.status === "active") {
      await assertCanActivateWebhookEndpoint(ctx, endpoint.organizationId);
    }
    await ctx.db.patch("webhook_endpoints", args.endpointId, {
      status: args.status,
      updatedAt: args.updatedAt ?? Date.now(),
    });
    return okResult();
  },
});

export const rotateWebhookEndpointSecret = mutation({
  args: {
    endpointId: v.id("webhook_endpoints"),
    organizationId: v.id("organizations"),
    secret: v.string(),
    updatedAt: v.optional(v.number()),
  },
  returns: okResultValidator,
  handler: async (ctx, args) => {
    await requireWebhookEndpointInOrganization(ctx, args.endpointId, args.organizationId);
    await ctx.db.patch("webhook_endpoints", args.endpointId, {
      secret: normalizeRequired(args.secret, "secret"),
      updatedAt: args.updatedAt ?? Date.now(),
    });
    return okResult();
  },
});

export const deleteWebhookEndpoint = mutation({
  args: {
    endpointId: v.id("webhook_endpoints"),
    organizationId: v.id("organizations"),
  },
  returns: okResultValidator,
  handler: async (ctx, args) => {
    const endpoint = await requireWebhookEndpointInOrganization(
      ctx,
      args.endpointId,
      args.organizationId,
    );
    if (endpoint.status !== "archived") {
      throw new Error("Only archived webhook endpoints can be deleted");
    }
    await ctx.db.delete("webhook_endpoints", args.endpointId);
    return okResult();
  },
});

export const createWebhookDelivery = mutation({
  args: {
    endpointId: v.id("webhook_endpoints"),
    eventId: v.string(),
    eventType: v.string(),
    payloadJson: v.string(),
    metadataJson: v.optional(v.string()),
    createdAt: v.optional(v.number()),
  },
  returns: v.object({
    deliveryId: v.id("webhook_deliveries"),
    created: v.literal(true),
  }),
  handler: async (ctx, args) => {
    const endpoint = await requireWebhookEndpoint(ctx, args.endpointId);
    if (endpoint.status !== "active") {
      throw new Error("Cannot create delivery for inactive webhook endpoint");
    }
    const now = args.createdAt ?? Date.now();
    const deliveryId = await ctx.db.insert("webhook_deliveries", {
      endpointId: args.endpointId,
      eventId: normalizeRequired(args.eventId, "eventId"),
      eventType: normalizeRequired(args.eventType, "eventType"),
      payloadJson: normalizeRequired(args.payloadJson, "payloadJson"),
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: now,
      metadataJson: normalizeOptional(args.metadataJson),
      createdAt: now,
      updatedAt: now,
    });
    return { deliveryId, created: true as const };
  },
});

export const enqueueWebhookEvent = mutation({
  args: {
    eventType: v.string(),
    eventId: v.string(),
    payloadJson: v.string(),
    organizationId: v.optional(v.id("organizations")),
    metadataJson: v.optional(v.string()),
    createdAt: v.optional(v.number()),
  },
  returns: v.object({
    eventId: v.string(),
    enqueued: v.number(),
    deliveryIds: v.array(v.id("webhook_deliveries")),
  }),
  handler: async (ctx, args) => {
    return await fanOutConvexWebhookEvent(ctx, args);
  },
});

/**
 * Shared fan-out helper that powers `enqueueWebhookEvent`. Component mutations
 * (e.g. organization/member/invitation writes) call this directly as a
 * side-effect after their DB write so the component is the source of truth that
 * emits the canonical Gap A webhook events. It lists active endpoints for the
 * org, subscription-matches them, and inserts a pending delivery per match.
 */
export async function fanOutConvexWebhookEvent(
  ctx: Pick<MutationCtx, "db">,
  args: {
    eventType: string;
    eventId: string;
    payloadJson: string;
    organizationId?: Id<"organizations">;
    metadataJson?: string;
    now?: number;
    createdAt?: number;
  },
): Promise<{
  eventId: string;
  enqueued: number;
  deliveryIds: Id<"webhook_deliveries">[];
}> {
  const now = args.now ?? args.createdAt ?? Date.now();
  const eventType = normalizeRequired(args.eventType, "eventType");
  const eventId = normalizeRequired(args.eventId, "eventId");
  const payloadJson = normalizeRequired(args.payloadJson, "payloadJson");
  const metadataJson = normalizeOptional(args.metadataJson);

  const endpoints = await listActiveEndpointsForEvent(ctx, args.organizationId);
  const deliveryIds = await Promise.all(
    endpoints
      .filter((endpoint) => endpointSubscribesTo(endpoint.eventTypes, eventType))
      .map((endpoint) =>
        ctx.db.insert("webhook_deliveries", {
          endpointId: endpoint._id,
          eventId,
          eventType,
          payloadJson,
          status: "pending",
          attemptCount: 0,
          nextAttemptAt: now,
          metadataJson,
          createdAt: now,
          updatedAt: now,
        }),
      ),
  );
  return { eventId, enqueued: deliveryIds.length, deliveryIds };
}

/**
 * Atomically claim a pending delivery for processing. Returns `true` only if
 * the row was `pending` and is now `processing`; `false` if another worker
 * already moved it out of `pending`. Because a Convex mutation is a single
 * transaction, this is the safe claim the delivery-queue recipe requires — two
 * concurrent processors cannot both claim (and therefore double-send) the same
 * row. Consumers call this before the network attempt and skip when it returns
 * `false`.
 */
export const claimWebhookDelivery = mutation({
  args: {
    deliveryId: v.id("webhook_deliveries"),
  },
  returns: v.object({ claimed: v.boolean() }),
  handler: async (ctx, { deliveryId }) => {
    const delivery = await requireWebhookDelivery(ctx, deliveryId);
    if (delivery.status !== "pending") {
      return { claimed: false };
    }
    await ctx.db.patch("webhook_deliveries", delivery._id, {
      status: "processing",
      updatedAt: Date.now(),
    });
    return { claimed: true };
  },
});

function setWebhookPatchValue<Key extends keyof Doc<"webhook_deliveries">>(
  patch: Partial<Doc<"webhook_deliveries">>,
  key: Key,
  value: Doc<"webhook_deliveries">[Key] | null | undefined,
): void {
  if (value !== undefined) {
    patch[key] = value ?? undefined;
  }
}

function webhookDeliveryPatch(args: {
  attemptCount?: number;
  deliveredAt?: number | null;
  exhaustedAt?: number | null;
  failureKind?: Doc<"webhook_deliveries">["failureKind"] | null;
  metadataJson?: string | null;
  nextAttemptAt?: number | null;
  responseBody?: string | null;
  responseStatus?: number | null;
  status?: Doc<"webhook_deliveries">["status"];
  updatedAt?: number;
}): Partial<Doc<"webhook_deliveries">> {
  const patch: Partial<Doc<"webhook_deliveries">> = {
    updatedAt: args.updatedAt ?? Date.now(),
  };
  setWebhookPatchValue(patch, "status", args.status);
  setWebhookPatchValue(patch, "attemptCount", args.attemptCount);
  setWebhookPatchValue(patch, "nextAttemptAt", args.nextAttemptAt);
  setWebhookPatchValue(patch, "responseStatus", args.responseStatus);
  setWebhookPatchValue(patch, "responseBody", args.responseBody);
  setWebhookPatchValue(patch, "failureKind", args.failureKind);
  setWebhookPatchValue(patch, "deliveredAt", args.deliveredAt);
  setWebhookPatchValue(patch, "exhaustedAt", args.exhaustedAt);
  setWebhookPatchValue(patch, "metadataJson", args.metadataJson);
  return patch;
}

export const updateWebhookDelivery = mutation({
  args: {
    deliveryId: v.id("webhook_deliveries"),
    status: v.optional(webhookDeliveryStatusValidator),
    attemptCount: v.optional(v.number()),
    nextAttemptAt: v.optional(v.union(v.number(), v.null())),
    responseStatus: v.optional(v.union(v.number(), v.null())),
    responseBody: v.optional(v.union(v.string(), v.null())),
    failureKind: v.optional(v.union(webhookFailureKindValidator, v.null())),
    deliveredAt: v.optional(v.union(v.number(), v.null())),
    exhaustedAt: v.optional(v.union(v.number(), v.null())),
    metadataJson: v.optional(v.union(v.string(), v.null())),
    updatedAt: v.optional(v.number()),
  },
  returns: okResultValidator,
  handler: async (ctx, args) => {
    const delivery = await requireWebhookDelivery(ctx, args.deliveryId);
    await ctx.db.patch("webhook_deliveries", delivery._id, webhookDeliveryPatch(args));
    return okResult();
  },
});

export const getWebhookDelivery = query({
  args: {
    deliveryId: v.id("webhook_deliveries"),
  },
  returns: v.union(v.null(), webhookDeliveryDocValidator),
  handler: async (ctx, { deliveryId }) => {
    return await ctx.db.get("webhook_deliveries", deliveryId);
  },
});

export const listWebhookDeliveriesByEndpoint = query({
  args: {
    endpointId: v.id("webhook_endpoints"),
    status: v.optional(webhookDeliveryStatusValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(webhookDeliveryDocValidator),
  handler: async (ctx, { endpointId, status, limit }) => {
    const resolvedLimit = resolveListLimit(limit);
    const index = status === undefined ? "by_endpoint" : "by_endpoint_status";
    const startIndexKey = status === undefined ? [endpointId] : [endpointId, status];
    const { page } = await getPage(ctx, {
      table: "webhook_deliveries",
      index,
      startIndexKey,
      endIndexKey: startIndexKey,
      absoluteMaxRows: resolvedLimit,
      schema,
    });
    return page;
  },
});

/**
 * Reads only up-to-limit PENDING rows via the `[status, nextAttemptAt]` index
 * instead of collecting the entire due-set and filtering status in JS — that
 * scan grew with the `webhook_deliveries` table (every delivery ever) and,
 * fired by the retry cron on every deployment, was a top Convex DB-I/O burner.
 */
export const listPendingWebhookDeliveries = query({
  args: {
    limit: v.optional(v.number()),
    beforeNextAttemptAt: v.optional(v.number()),
  },
  returns: v.array(webhookDeliveryDocValidator),
  handler: async (ctx, { limit, beforeNextAttemptAt }) => {
    const resolvedLimit = resolveListLimit(limit);
    const startIndexKey: (string | number)[] = ["pending"];
    const endIndexKey: (string | number)[] =
      beforeNextAttemptAt !== undefined ? ["pending", beforeNextAttemptAt] : ["pending"];
    const { page } = await getPage(ctx, {
      table: "webhook_deliveries",
      index: "by_status_next_attempt",
      startIndexKey,
      endIndexKey,
      endInclusive: beforeNextAttemptAt !== undefined,
      absoluteMaxRows: resolvedLimit,
      schema,
    });
    return page;
  },
});

const WEBHOOK_SUBSCRIBE_ALL = "*";

function endpointSubscribesTo(subscribedEventTypes: readonly string[], eventType: string): boolean {
  return subscribedEventTypes.some(
    (subscribed) => subscribed === WEBHOOK_SUBSCRIBE_ALL || subscribed === eventType,
  );
}

async function getActiveEndpointsByOrg(
  ctx: DbCtx,
  organizationId: Id<"organizations"> | undefined,
): Promise<Doc<"webhook_endpoints">[]> {
  const { page } = await getPage(ctx, {
    table: "webhook_endpoints",
    index: "by_org_status",
    startIndexKey: [organizationId, "active"],
    endIndexKey: [organizationId, "active"],
    absoluteMaxRows: MAX_ACTIVE_WEBHOOK_ENDPOINTS_PER_SCOPE + 1,
    schema,
  });
  return assertEndpointSetWithinLimit(page);
}

/**
 * An org-scoped event reaches that org's endpoints AND any global (no-org)
 * endpoints. Global endpoints are platform/cache subscribers — e.g. a consumer
 * hydrating a one-way org/member read-cache from these canonical events, or a
 * listener that must catch `organization.created` (whose org id can't have
 * been subscribed to in advance). Both queries stay indexed
 * (`by_org_status`); the two result sets are disjoint by `organizationId`, so
 * no dedup is needed.
 */
async function listActiveEndpointsForEvent(
  ctx: DbCtx,
  organizationId: Id<"organizations"> | undefined,
): Promise<Doc<"webhook_endpoints">[]> {
  if (organizationId === undefined) {
    return await getActiveEndpointsByOrg(ctx, organizationId);
  }
  const [scoped, global] = await Promise.all([
    getActiveEndpointsByOrg(ctx, organizationId),
    getActiveEndpointsByOrg(ctx, undefined),
  ]);
  return [...scoped, ...global];
}

function assertEndpointSetWithinLimit(
  endpoints: Doc<"webhook_endpoints">[],
): Doc<"webhook_endpoints">[] {
  if (endpoints.length > MAX_ACTIVE_WEBHOOK_ENDPOINTS_PER_SCOPE) {
    throw new Error(
      `Webhook scope exceeds the supported ${MAX_ACTIVE_WEBHOOK_ENDPOINTS_PER_SCOPE} active endpoints`,
    );
  }
  return endpoints;
}

async function assertCanActivateWebhookEndpoint(
  ctx: DbCtx,
  organizationId: Id<"organizations"> | undefined,
): Promise<void> {
  const { page: existingActiveEndpoints } = await getPage(ctx, {
    table: "webhook_endpoints",
    index: "by_org_status",
    startIndexKey: [organizationId, "active"],
    endIndexKey: [organizationId, "active"],
    absoluteMaxRows: MAX_ACTIVE_WEBHOOK_ENDPOINTS_PER_SCOPE,
    schema,
  });
  if (existingActiveEndpoints.length >= MAX_ACTIVE_WEBHOOK_ENDPOINTS_PER_SCOPE) {
    throw new Error(
      `A webhook scope supports at most ${MAX_ACTIVE_WEBHOOK_ENDPOINTS_PER_SCOPE} active endpoints`,
    );
  }
}

async function requireWebhookEndpoint(ctx: DbCtx, endpointId: Id<"webhook_endpoints">) {
  const endpoint = await ctx.db.get("webhook_endpoints", endpointId);
  if (endpoint === null) {
    throw new Error("Webhook endpoint not found");
  }
  return endpoint;
}

/**
 * Existence + tenant-ownership guard. Mutating/reading a webhook endpoint by id
 * alone is a cross-organization IDOR (rotate another tenant's signing secret →
 * webhook MITM; redirect/delete their endpoints; read their secret). Every
 * id-addressed op must prove the endpoint lives in the org the caller named.
 * Fails closed — an org-less endpoint never matches a real org id, so it cannot
 * be reached through these org-scoped ops.
 */
async function requireWebhookEndpointInOrganization(
  ctx: DbCtx,
  endpointId: Id<"webhook_endpoints">,
  organizationId: Id<"organizations">,
) {
  const endpoint = await requireWebhookEndpoint(ctx, endpointId);
  if (endpoint.organizationId !== organizationId) {
    throw new Error("Webhook endpoint not found");
  }
  return endpoint;
}

async function requireWebhookDelivery(ctx: DbCtx, deliveryId: Id<"webhook_deliveries">) {
  const delivery = await ctx.db.get("webhook_deliveries", deliveryId);
  if (delivery === null) {
    throw new Error("Webhook delivery not found");
  }
  return delivery;
}

function normalizeRequired(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

function normalizeOptional(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function normalizeStringArray(values: readonly string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function resolveListLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return 100;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 500);
}
