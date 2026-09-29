import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  webhookSink: defineTable({
    eventId: v.string(),
    eventType: v.string(),
    deliveryHeader: v.optional(v.string()),
    signature: v.optional(v.string()),
    bodyJson: v.string(),
    receivedAt: v.number(),
  }).index("by_eventId", ["eventId"]),
});
