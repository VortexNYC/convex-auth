import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
  agentAuthAuditActorTypeValidator,
  agentCapabilityGrantStatusValidator,
  agentDeviceAuthorizationStatusValidator,
  agentHostStatusValidator,
  agentKeyStatusValidator,
  agentModeValidator,
  agentStatusValidator,
} from "./validators.js";

export const agent_hosts = defineTable({
  organizationId: v.id("organizations"),
  name: v.string(),
  status: agentHostStatusValidator,
  activeKeyGeneration: v.number(),
  activatedBy: v.optional(v.id("users")),
  activatedAt: v.optional(v.number()),
  revokedBy: v.optional(v.id("users")),
  revokedAt: v.optional(v.number()),
  cascadeCompletedAt: v.optional(v.number()),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_organization_status", ["organizationId", "status"]);

export const agent_host_keys = defineTable({
  hostId: v.id("agent_hosts"),
  generation: v.number(),
  thumbprint: v.string(),
  publicJwkJson: v.string(),
  status: agentKeyStatusValidator,
  createdAt: v.number(),
  retiredAt: v.optional(v.number()),
})
  .index("by_host_generation", ["hostId", "generation"])
  .index("by_thumbprint", ["thumbprint"]);

export const agents = defineTable({
  organizationId: v.id("organizations"),
  hostId: v.id("agent_hosts"),
  name: v.string(),
  mode: agentModeValidator,
  status: agentStatusValidator,
  delegatedUserId: v.optional(v.id("users")),
  permissions: v.array(v.string()),
  activeKeyGeneration: v.number(),
  activatedBy: v.optional(v.id("users")),
  activatedAt: v.optional(v.number()),
  expiresAt: v.optional(v.number()),
  absoluteExpiresAt: v.optional(v.number()),
  revokedBy: v.optional(v.id("users")),
  revokedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_organization_status", ["organizationId", "status"])
  .index("by_host_status", ["hostId", "status"]);

export const agent_keys = defineTable({
  agentId: v.id("agents"),
  generation: v.number(),
  thumbprint: v.string(),
  publicJwkJson: v.string(),
  status: agentKeyStatusValidator,
  createdAt: v.number(),
  retiredAt: v.optional(v.number()),
})
  .index("by_agent_generation", ["agentId", "generation"])
  .index("by_thumbprint", ["thumbprint"]);

export const agent_capability_grants = defineTable({
  organizationId: v.id("organizations"),
  agentId: v.id("agents"),
  capability: v.string(),
  constraintsJson: v.optional(v.string()),
  status: agentCapabilityGrantStatusValidator,
  grantedBy: v.optional(v.id("users")),
  deniedBy: v.optional(v.id("users")),
  reason: v.optional(v.string()),
  expiresAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_agent_status", ["agentId", "status"])
  .index("by_agent_capability", ["agentId", "capability"]);

export const agent_replay_records = defineTable({
  agentId: v.id("agents"),
  replayIdHash: v.string(),
  expiresAt: v.number(),
  createdAt: v.number(),
})
  .index("by_replay_hash", ["replayIdHash"])
  .index("by_expiry", ["expiresAt"]);

export const agent_host_replay_records = defineTable({
  hostId: v.id("agent_hosts"),
  replayIdHash: v.string(),
  expiresAt: v.number(),
  createdAt: v.number(),
})
  .index("by_replay_hash", ["replayIdHash"])
  .index("by_expiry", ["expiresAt"]);

export const agent_device_authorizations = defineTable({
  organizationId: v.id("organizations"),
  hostId: v.id("agent_hosts"),
  agentId: v.id("agents"),
  status: agentDeviceAuthorizationStatusValidator,
  userCodeHash: v.string(),
  deviceCodeHash: v.string(),
  pollCount: v.number(),
  pollIntervalSeconds: v.number(),
  nextPollAt: v.number(),
  expiresAt: v.number(),
  approvedBy: v.optional(v.id("users")),
  approvedAt: v.optional(v.number()),
  deniedBy: v.optional(v.id("users")),
  deniedAt: v.optional(v.number()),
  consumedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user_code_hash", ["userCodeHash"])
  .index("by_device_code_hash", ["deviceCodeHash"])
  .index("by_agent_status", ["agentId", "status"])
  .index("by_expiry", ["expiresAt"]);

export const agent_device_authorization_attempts = defineTable({
  operatorUserId: v.id("users"),
  attempts: v.number(),
  windowStartedAt: v.number(),
  blockedUntil: v.optional(v.number()),
  updatedAt: v.number(),
}).index("by_operator", ["operatorUserId"]);

export const agent_auth_audit_events = defineTable({
  organizationId: v.id("organizations"),
  hostId: v.optional(v.id("agent_hosts")),
  agentId: v.optional(v.id("agents")),
  actorType: agentAuthAuditActorTypeValidator,
  actorUserId: v.optional(v.id("users")),
  eventType: v.string(),
  reasonCode: v.optional(v.string()),
  createdAt: v.number(),
})
  .index("by_organization_created_at", ["organizationId", "createdAt"])
  .index("by_agent_created_at", ["agentId", "createdAt"])
  .index("by_host_created_at", ["hostId", "createdAt"]);
