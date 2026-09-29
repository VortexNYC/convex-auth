import { v } from "convex/values";
import { mutation, query } from "../_generated/server.js";
import { components } from "../_generated/api.js";
import { RateLimiter } from "@convex-dev/rate-limiter";

const rateLimiter = new RateLimiter(components.rateLimiter, {});

export const recordAttempt = mutation({
  args: {
    identifier: v.string(),
    windowStart: v.number(),
    windowMs: v.number(),
    maxAttempts: v.number(),
  },
  returns: v.object({ allowed: v.boolean(), count: v.optional(v.number()) }),
  handler: async (ctx, args) => {
    const { ok } = await rateLimiter.limit(ctx, "auth", {
      key: args.identifier,
      config: {
        kind: "fixed window",
        rate: args.maxAttempts,
        period: args.windowMs,
        start: args.windowStart,
      },
    });
    return { allowed: ok };
  },
});

export const checkRateLimit = query({
  args: {
    identifier: v.string(),
    windowStart: v.number(),
    windowMs: v.number(),
    maxAttempts: v.number(),
  },
  returns: v.object({ allowed: v.boolean(), count: v.optional(v.number()) }),
  handler: async (ctx, args) => {
    const { ok } = await rateLimiter.check(ctx, "auth", {
      key: args.identifier,
      config: {
        kind: "fixed window",
        rate: args.maxAttempts,
        period: args.windowMs,
        start: args.windowStart,
      },
    });
    return { allowed: ok };
  },
});

export const cleanupExpiredRateLimits = mutation({
  args: { before: v.number() },
  returns: v.number(),
  handler: async (_ctx, _args) => {
    return 0;
  },
});
