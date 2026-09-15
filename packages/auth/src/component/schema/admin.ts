import { defineTable } from "convex/server";
import { v } from "convex/values";

export const auth_admin_audits = defineTable({
  adminId: v.id("users"),
  action: v.string(),
  targetType: v.string(),
  targetId: v.string(),
  result: v.string(),
  payloadJson: v.optional(v.string()),
  createdAt: v.number(),
})
  .index("by_admin", ["adminId"])
  .index("by_target", ["targetType", "targetId"])
  .index("by_createdAt", ["createdAt"]);
