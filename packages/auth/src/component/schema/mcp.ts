import { defineTable } from "convex/server";
import { v } from "convex/values";

export const mcp_oauth_authorization_codes = defineTable({
  code: v.string(),
  clientId: v.string(),
  redirectUri: v.string(),
  subjectId: v.string(),
  organizationId: v.string(),
  scopes: v.array(v.string()),
  codeChallenge: v.string(),
  codeChallengeMethod: v.literal("S256"),
  state: v.optional(v.string()),
  audience: v.string(),
  resourceId: v.string(),
  expiresAt: v.number(),
  consumedAt: v.optional(v.number()),
  createdAt: v.number(),
}).index("by_code", ["code"]);

export const mcp_oauth_signing_keys = defineTable({
  keyId: v.string(),
  algorithm: v.literal("ES256"),
  publicJwkJson: v.string(),
  privateJwkJson: v.string(),
  status: v.union(v.literal("active"), v.literal("retired")),
  retiredAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_key_id", ["keyId"])
  .index("by_updated_at", ["updatedAt"])
  .index("by_status_updated_at", ["status", "updatedAt"])
  .index("by_status_retired_at", ["status", "retiredAt"]);

export const mcp_oauth_clients = defineTable({
  clientId: v.string(),
  name: v.string(),
  redirectUris: v.array(v.string()),
  allowedScopes: v.array(v.string()),
  tokenEndpointAuthMethod: v.literal("none"),
  pkceRequired: v.boolean(),
  grantTypes: v.array(v.string()),
  responseTypes: v.array(v.string()),
  softwareId: v.optional(v.string()),
  softwareVersion: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_client_id", ["clientId"]);

export const mcp_oauth_refresh_tokens = defineTable({
  tokenHash: v.string(),
  tokenId: v.string(),
  familyId: v.string(),
  parentTokenId: v.optional(v.string()),
  clientId: v.string(),
  subjectId: v.string(),
  organizationId: v.string(),
  scopes: v.array(v.string()),
  audience: v.string(),
  resourceId: v.string(),
  issuedAt: v.number(),
  expiresAt: v.number(),
  inactivityExpiresAt: v.optional(v.number()),
  consumedAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
  replacedByTokenId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_token_hash", ["tokenHash"])
  .index("by_family_id", ["familyId"]);

export const mcp_oauth_revoked_families = defineTable({
  familyId: v.string(),
  revokedAt: v.number(),
  reason: v.union(v.literal("replay_detected"), v.literal("concurrent_conflict")),
}).index("by_family_id", ["familyId"]);
