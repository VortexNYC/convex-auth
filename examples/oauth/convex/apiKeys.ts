import { query, mutation } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";
import { requireCaller, requireMatchingUserId, requireOrganizationMembership } from "./authz";

export const list = query({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    const callerId = await requireCaller(ctx);
    await requireOrganizationMembership(ctx, callerId, args.organizationId);
    return await ctx.runQuery(components.convexAuth.apiKeys.listApiKeysByOrganization, {
      organizationId: args.organizationId,
    });
  },
});

export const create = mutation({
  args: {
    organizationId: v.string(),
    userId: v.string(),
    name: v.string(),
    scopes: v.array(v.string()),
    allowedIpRanges: v.optional(v.array(v.string())),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const callerId = await requireMatchingUserId(ctx, args.userId);
    await requireOrganizationMembership(ctx, callerId, args.organizationId);

    const result = await ctx.runMutation(components.convexAuth.apiKeys.issueApiKey, {
      organizationId: args.organizationId,
      userId: callerId,
      name: args.name,
      environment: "production",
      scopes: args.scopes,
      allowedIpRanges: args.allowedIpRanges,
      expiresAt: args.expiresAt,
    });

    await ctx.runMutation(components.convexAuth.native.audit.createAuthAuditEvent, {
      actorUserId: callerId,
      actorType: "user",
      eventType: "api_key.created",
      targetType: "api_key",
      targetId: result.apiKeyId,
      organizationId: args.organizationId,
      metadataJson: `API key created: ${args.name}`,
    });

    return result;
  },
});

export const revoke = mutation({
  args: { apiKeyId: v.string(), organizationId: v.string() },
  handler: async (ctx, args) => {
    const callerId = await requireCaller(ctx);
    await requireOrganizationMembership(ctx, callerId, args.organizationId);

    const key = await ctx.runQuery(components.convexAuth.apiKeys.getApiKey, {
      apiKeyId: args.apiKeyId,
    });
    if (key === null || key.organizationId !== args.organizationId) {
      throw new Error("Forbidden");
    }

    return await ctx.runMutation(components.convexAuth.apiKeys.revokeApiKey, {
      apiKeyId: args.apiKeyId,
      organizationId: args.organizationId,
    });
  },
});

export const rotate = mutation({
  args: { apiKeyId: v.string(), organizationId: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const callerId = await requireMatchingUserId(ctx, args.userId);
    await requireOrganizationMembership(ctx, callerId, args.organizationId);

    const existing = await ctx.runQuery(components.convexAuth.apiKeys.getApiKey, {
      apiKeyId: args.apiKeyId,
    });
    if (existing === null) {
      throw new Error("API key not found");
    }
    if (existing.status !== "active") {
      throw new Error("Only active API keys can be rotated");
    }
    if (existing.userId !== callerId || existing.organizationId !== args.organizationId) {
      throw new Error("Forbidden");
    }

    const replacement = await ctx.runMutation(components.convexAuth.apiKeys.issueApiKey, {
      organizationId: args.organizationId,
      userId: callerId,
      name: existing.name,
      environment: existing.environment ?? "production",
      scopes: existing.scopes,
      allowedIpRanges: existing.allowedIpRanges,
      expiresAt: existing.expiresAt,
    });

    await ctx.runMutation(components.convexAuth.apiKeys.revokeApiKey, {
      apiKeyId: args.apiKeyId,
      organizationId: args.organizationId,
    });

    return replacement;
  },
});
