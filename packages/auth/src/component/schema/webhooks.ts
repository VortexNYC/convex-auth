import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
  webhookDeliveryStatusValidator,
  webhookEndpointStatusValidator,
  webhookFailureKindValidator,
} from "./validators.js";

export const webhook_endpoints = defineTable({
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
})
  .index("by_organization", ["organizationId"])
  .index("by_status", ["status"])
  .index("by_org_status", ["organizationId", "status"])
  .index("by_createdBy", ["createdBy"]);

export const webhook_deliveries = defineTable({
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
})
  .index("by_endpoint", ["endpointId"])
  .index("by_event", ["eventId"])
  .index("by_endpoint_status", ["endpointId", "status"])
  .index("by_next_attempt", ["nextAttemptAt"])
  .index("by_status_next_attempt", ["status", "nextAttemptAt"]);
