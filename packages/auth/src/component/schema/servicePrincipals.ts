import { defineTable } from "convex/server";
import { v } from "convex/values";
import { servicePrincipalStatusValidator } from "./validators.js";

export const service_principals = defineTable({
  key: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  status: servicePrincipalStatusValidator,
  organizationId: v.optional(v.id("organizations")),
  permissions: v.array(v.string()),
  metadataJson: v.optional(v.string()),
  createdBy: v.optional(v.id("users")),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_key", ["key"])
  .index("by_status", ["status"])
  .index("by_organization", ["organizationId"])
  .index("by_organization_status", ["organizationId", "status"])
  .index("by_createdBy", ["createdBy"]);
