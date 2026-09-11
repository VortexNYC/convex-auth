import { defineTable } from "convex/server";
import { v } from "convex/values";
import { emailTwoFactorResetReasonValidator, emailTwoFactorStatusValidator } from "./validators.js";

export const users = defineTable({
  email: v.optional(v.string()),
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  emailVerified: v.boolean(),
  emailTwoFactorStatus: v.optional(emailTwoFactorStatusValidator),
  emailTwoFactorEmail: v.optional(v.string()),
  emailTwoFactorEnabledAt: v.optional(v.number()),
  emailTwoFactorDisabledAt: v.optional(v.number()),
  emailTwoFactorLastVerifiedAt: v.optional(v.number()),
  emailTwoFactorResetAt: v.optional(v.number()),
  emailTwoFactorResetReason: v.optional(emailTwoFactorResetReasonValidator),
  twoFactorEnabled: v.optional(v.boolean()),
  twoFactorSecret: v.optional(v.string()),
  twoFactorBackupCodes: v.optional(v.array(v.string())),
  activeOrganizationId: v.optional(v.id("organizations")),
  isActive: v.boolean(),
  isSuperAdmin: v.optional(v.boolean()),
  isAnonymous: v.optional(v.boolean()),
  metadataJson: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_email", ["email"])
  .index("by_active_organization", ["activeOrganizationId"]);

export const auth_identities = defineTable({
  identityId: v.string(),
  userId: v.id("users"),
  provider: v.string(),
  issuer: v.string(),
  subject: v.string(),
  tokenIdentifier: v.string(),
  email: v.optional(v.string()),
  emailVerified: v.boolean(),
  sessionId: v.optional(v.union(v.string(), v.null())),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_identity_id", ["identityId"])
  .index("by_provider_issuer_subject", ["provider", "issuer", "subject"])
  .index("by_issuer_subject", ["issuer", "subject"])
  .index("by_token_identifier", ["tokenIdentifier"])
  .index("by_user", ["userId"])
  .index("by_user_provider_issuer", ["userId", "provider", "issuer"]);
