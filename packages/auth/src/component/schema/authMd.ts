import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
  authMdAssertionStatusValidator,
  authMdAuditActorTypeValidator,
  authMdCredentialStatusValidator,
  authMdRegistrationStatusValidator,
} from "./validators.js";

export const auth_md_registrations = defineTable({
  resource: v.string(),
  loginHintHash: v.string(),
  scopes: v.array(v.string()),
  status: authMdRegistrationStatusValidator,
  claimTokenHash: v.string(),
  claimViewTokenHash: v.string(),
  userCodeHash: v.string(),
  pollCount: v.number(),
  pollIntervalSeconds: v.number(),
  nextPollAt: v.number(),
  failedCodeAttempts: v.number(),
  expiresAt: v.number(),
  userCodeExpiresAt: v.number(),
  claimedByUserId: v.optional(v.id("users")),
  organizationId: v.optional(v.id("organizations")),
  claimedAt: v.optional(v.number()),
  assertionIssuedAt: v.optional(v.number()),
  revokedBy: v.optional(v.id("users")),
  revokedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_claim_token_hash", ["claimTokenHash"])
  .index("by_claim_view_token_hash", ["claimViewTokenHash"])
  .index("by_user_status", ["claimedByUserId", "status"])
  .index("by_organization_status", ["organizationId", "status"])
  .index("by_expiry", ["expiresAt"]);

export const auth_md_assertions = defineTable({
  registrationId: v.id("auth_md_registrations"),
  resource: v.string(),
  userId: v.id("users"),
  organizationId: v.id("organizations"),
  scopes: v.array(v.string()),
  status: authMdAssertionStatusValidator,
  expiresAt: v.number(),
  consumedAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
  createdAt: v.number(),
}).index("by_expiry", ["expiresAt"]);

export const auth_md_credentials = defineTable({
  registrationId: v.id("auth_md_registrations"),
  assertionId: v.id("auth_md_assertions"),
  resource: v.string(),
  userId: v.id("users"),
  organizationId: v.id("organizations"),
  scopes: v.array(v.string()),
  status: authMdCredentialStatusValidator,
  expiresAt: v.number(),
  revokedBy: v.optional(v.id("users")),
  revokedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user_organization", ["userId", "organizationId"])
  .index("by_expiry", ["expiresAt"]);

export const auth_md_audit_events = defineTable({
  registrationId: v.id("auth_md_registrations"),
  assertionId: v.optional(v.id("auth_md_assertions")),
  credentialId: v.optional(v.id("auth_md_credentials")),
  organizationId: v.optional(v.id("organizations")),
  userId: v.optional(v.id("users")),
  actorType: authMdAuditActorTypeValidator,
  actorUserId: v.optional(v.id("users")),
  eventType: v.string(),
  reasonCode: v.optional(v.string()),
  createdAt: v.number(),
});
