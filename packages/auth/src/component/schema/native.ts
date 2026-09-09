import { defineTable } from "convex/server";
import { v } from "convex/values";
import { verificationCodeTypeValidator } from "./validators.js";

export const authAccounts = defineTable({
  userId: v.id("users"),
  provider: v.string(),
  issuer: v.string(),
  subject: v.string(),
  credentialHash: v.string(),
  accessToken: v.optional(v.string()),
  refreshToken: v.optional(v.string()),
  idToken: v.optional(v.string()),
  tokenType: v.optional(v.string()),
  scopes: v.optional(v.array(v.string())),
  accessTokenExpiresAt: v.optional(v.number()),
  refreshTokenExpiresAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_provider_issuer_subject", ["provider", "issuer", "subject"]);

export const authSessions = defineTable({
  sessionId: v.string(),
  userId: v.id("users"),
  token: v.string(),
  expiresAt: v.number(),
  ipAddress: v.optional(v.string()),
  userAgent: v.optional(v.string()),
  revokedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_session_id", ["sessionId"])
  .index("by_token", ["token"])
  .index("by_user", ["userId"])
  .index("by_expires_at", ["expiresAt"]);

export const authRefreshTokens = defineTable({
  tokenHash: v.string(),
  sessionId: v.string(),
  userId: v.id("users"),
  expiresAt: v.number(),
  revokedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_token_hash", ["tokenHash"])
  .index("by_session", ["sessionId"])
  .index("by_user", ["userId"])
  .index("by_expires_at", ["expiresAt"]);

export const authVerificationCodes = defineTable({
  userId: v.id("users"),
  type: verificationCodeTypeValidator,
  tokenHash: v.string(),
  expiresAt: v.number(),
  consumedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_token_hash", ["tokenHash", "type"])
  .index("by_user_type", ["userId", "type"]);

export const authVerifiers = defineTable({
  verifierId: v.string(),
  type: v.string(),
  provider: v.optional(v.string()),
  codeChallenge: v.optional(v.string()),
  codeChallengeMethod: v.optional(v.string()),
  redirectUri: v.optional(v.string()),
  metadata: v.optional(v.string()),
  expiresAt: v.number(),
  consumedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_verifier_id", ["verifierId"])
  .index("by_expires_at", ["expiresAt"]);

export const authMagicLinkTokens = defineTable({
  email: v.string(),
  name: v.optional(v.string()),
  tokenHash: v.string(),
  expiresAt: v.number(),
  consumedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_token_hash", ["tokenHash"])
  .index("by_email", ["email"]);
