import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
  invitationEmailDeliveryStatusValidator,
  organizationInvitationStatusValidator,
  organizationMemberStatusValidator,
  organizationStatusValidator,
} from "./validators.js";

export const organizations = defineTable({
  name: v.string(),
  slug: v.string(),
  imageUrl: v.optional(v.string()),
  status: organizationStatusValidator,
  createdBy: v.optional(v.id("users")),
  metadataJson: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_slug", ["slug"])
  .index("by_status", ["status"]);

export const organization_roles = defineTable({
  organizationId: v.id("organizations"),
  key: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  permissions: v.array(v.string()),
  isSystem: v.boolean(),
  createdBy: v.optional(v.id("users")),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  /* eslint-disable-next-line @convex-dev/no-duplicate-indexes -- by_organization serves creation-ordered first-N role lists; by_organization_key sorts by key */
  .index("by_organization", ["organizationId"])
  .index("by_organization_key", ["organizationId", "key"]);

export const organization_members = defineTable({
  organizationId: v.id("organizations"),
  userId: v.optional(v.id("users")),
  roleId: v.id("organization_roles"),
  status: organizationMemberStatusValidator,
  invitedEmail: v.optional(v.string()),
  invitedBy: v.optional(v.id("users")),
  assignedBy: v.optional(v.id("users")),
  invitedAt: v.optional(v.number()),
  acceptedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  /* eslint-disable-next-line @convex-dev/no-duplicate-indexes -- by_user serves creation-ordered first-N membership lists; by_user_status sorts by status */
  .index("by_user", ["userId"])
  .index("by_user_status", ["userId", "status"])
  /* eslint-disable-next-line @convex-dev/no-duplicate-indexes -- by_organization serves creation-ordered first-N member lists; by_org_status sorts by status */
  .index("by_organization", ["organizationId"])
  .index("by_user_organization", ["userId", "organizationId"])
  .index("by_role", ["roleId"])
  .index("by_org_status", ["organizationId", "status"])
  .index("by_invited_email", ["invitedEmail"])
  .index("by_organization_invited_email", ["organizationId", "invitedEmail"]);

export const organization_invitations = defineTable({
  organizationId: v.id("organizations"),
  roleId: v.id("organization_roles"),
  email: v.string(),
  tokenHash: v.string(),
  status: organizationInvitationStatusValidator,
  invitedBy: v.id("users"),
  expiresAt: v.number(),
  acceptedByUserId: v.optional(v.id("users")),
  acceptedAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
  emailId: v.optional(v.string()),
  emailDeliveryStatus: v.optional(invitationEmailDeliveryStatusValidator),
  emailDeliveryEvent: v.optional(v.string()),
  emailDeliveryError: v.optional(v.string()),
  emailDeliveryUpdatedAt: v.optional(v.number()),
  metadataJson: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_token_hash", ["tokenHash"])
  .index("by_email_id", ["emailId"])
  .index("by_email", ["email"])
  /* eslint-disable-next-line @convex-dev/no-duplicate-indexes -- by_organization serves creation-ordered first-N invitation lists; by_org_status sorts by status */
  .index("by_organization", ["organizationId"])
  .index("by_org_status", ["organizationId", "status"])
  .index("by_role", ["roleId"]);
