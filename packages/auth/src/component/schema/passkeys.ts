import { defineTable } from "convex/server";
import { v } from "convex/values";

export const auth_passkeys = defineTable({
  userId: v.id("users"),
  identityId: v.optional(v.id("auth_identities")),
  credentialId: v.string(),
  publicKey: v.string(),
  counter: v.number(),
  transports: v.optional(v.array(v.string())),
  aaguid: v.optional(v.string()),
  deviceType: v.optional(v.string()),
  backedUp: v.optional(v.boolean()),
  name: v.optional(v.string()),
  createdAt: v.number(),
  lastUsedAt: v.number(),
  revokedAt: v.optional(v.number()),
})
  .index("by_userId", ["userId"])
  .index("by_credentialId", ["credentialId"])
  .index("by_identityId", ["identityId"]);

export const auth_passkey_challenges = defineTable({
  challenge: v.string(),
  type: v.union(v.literal("registration"), v.literal("authentication")),
  userId: v.optional(v.id("users")),
  identifier: v.optional(v.string()),
  expiresAt: v.number(),
  createdAt: v.number(),
})
  .index("by_challenge", ["challenge"])
  .index("by_expiresAt", ["expiresAt"])
  .index("by_userId", ["userId"]);
