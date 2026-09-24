import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
  apiKeyEnvironmentValidator,
  apiKeyOwnerTypeValidator,
  apiKeyStatusValidator,
  authAuditActorTypeValidator,
} from "./validators.js";

export const api_keys = defineTable({
  organizationId: v.optional(v.id("organizations")),
  userId: v.optional(v.id("users")),
  name: v.string(),
  keyPrefix: v.string(),
  keyHash: v.string(),
  /**
   * Leading plaintext of the issued key (e.g. "vb_test_a829"). Enough for a dashboard
   * to identify a key without ever storing the secret.
   */
  keyStart: v.optional(v.string()),
  environment: v.optional(apiKeyEnvironmentValidator),
  ownerType: v.optional(apiKeyOwnerTypeValidator),
  ownerId: v.optional(v.string()),
  ownerServicePrincipalId: v.optional(v.id("service_principals")),
  fixedOrganizationId: v.optional(v.id("organizations")),
  permissions: v.optional(v.array(v.string())),
  requestId: v.optional(v.string()),
  requestIdExpiresAt: v.optional(v.number()),
  scopes: v.array(v.string()),
  allowedIpRanges: v.optional(v.array(v.string())),
  expiresAt: v.optional(v.number()),
  status: apiKeyStatusValidator,
  lastUsedAt: v.optional(v.number()),
  lastUsedIp: v.optional(v.string()),
  /** Fixed-window rate limiting, per key (this field through `lastRequestAt`). */
  rateLimitEnabled: v.optional(v.boolean()),
  rateLimitTimeWindowMs: v.optional(v.number()),
  rateLimitMax: v.optional(v.number()),
  requestCount: v.optional(v.number()),
  windowStartedAt: v.optional(v.number()),
  lastRequestAt: v.optional(v.number()),
  /**
   * Quota, independent of the rate limit: a total budget that refills on an
   * interval (this field through `lastRefillAt`).
   */
  remaining: v.optional(v.number()),
  refillAmount: v.optional(v.number()),
  refillIntervalMs: v.optional(v.number()),
  lastRefillAt: v.optional(v.number()),
  metadataJson: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  /* eslint-disable-next-line @convex-dev/no-duplicate-indexes -- by_organization serves creation-ordered first-N key lists; by_organization_environment sorts by environment */
  .index("by_organization", ["organizationId"])
  .index("by_user", ["userId"])
  .index("by_key_prefix", ["keyPrefix"])
  .index("by_organization_environment", ["organizationId", "environment"])
  /* eslint-disable-next-line @convex-dev/no-duplicate-indexes -- by_owner_service serves creation-ordered first-N key lists; by_owner_service_status sorts by status */
  .index("by_owner_service", ["ownerServicePrincipalId"])
  .index("by_owner_service_status", ["ownerServicePrincipalId", "status"])
  .index("by_org_status", ["organizationId", "status"])
  .index("by_organization_and_request_id", ["organizationId", "requestId"]);

export const auth_audit_events = defineTable({
  actorUserId: v.optional(v.id("users")),
  actorType: authAuditActorTypeValidator,
  eventType: v.string(),
  targetType: v.string(),
  targetId: v.optional(v.string()),
  organizationId: v.optional(v.id("organizations")),
  metadataJson: v.optional(v.string()),
  createdAt: v.number(),
})
  .index("by_organization", ["organizationId"])
  .index("by_event_type", ["eventType"])
  .index("by_created_at", ["createdAt"]);
