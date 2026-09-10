import { query, mutation } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";
import { requireCaller, requireMatchingUserId, requireOrganizationMembership } from "./authz";

export const list = query({
  args: {
    organizationId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const callerId = await requireCaller(ctx);
    const organizationId = args.organizationId;
    if (organizationId === undefined) {
      throw new Error("Organization required");
    }
    await requireOrganizationMembership(ctx, callerId, organizationId);
    return await ctx.runQuery(components.convexAuth.servicePrincipals.listServicePrincipals, {
      organizationId,
      status: "active",
      limit: args.limit ?? 50,
    });
  },
});

export const create = mutation({
  args: {
    organizationId: v.string(),
    userId: v.string(),
    key: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    permissions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const callerId = await requireMatchingUserId(ctx, args.userId);
    await requireOrganizationMembership(ctx, callerId, args.organizationId);

    const result = await ctx.runMutation(
      components.convexAuth.servicePrincipals.upsertServicePrincipal,
      {
        organizationId: args.organizationId,
        createdBy: callerId,
        key: args.key,
        name: args.name,
        description: args.description,
        permissions: args.permissions ?? ["data:read"],
      },
    );

    await ctx.runMutation(components.convexAuth.native.audit.createAuthAuditEvent, {
      actorUserId: callerId,
      actorType: "user",
      eventType: "service_principal.created",
      targetType: "service_principal",
      targetId: result.servicePrincipalId,
      organizationId: args.organizationId,
      metadataJson: `Service principal created: ${args.name}`,
    });

    return result;
  },
});

export const issueApiKey = mutation({
  args: {
    organizationId: v.string(),
    userId: v.string(),
    servicePrincipalId: v.string(),
    name: v.string(),
    permissions: v.optional(v.array(v.string())),
    environment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const callerId = await requireMatchingUserId(ctx, args.userId);
    await requireOrganizationMembership(ctx, callerId, args.organizationId);

    const principal = await ctx.runQuery(
      components.convexAuth.servicePrincipals.getServicePrincipal,
      { servicePrincipalId: args.servicePrincipalId },
    );
    if (principal === null || principal.organizationId !== args.organizationId) {
      throw new Error("Forbidden");
    }

    const result = await ctx.runMutation(components.convexAuth.apiKeys.issueServiceOwnedApiKey, {
      servicePrincipalId: args.servicePrincipalId,
      name: args.name,
      environment: (args.environment as "sandbox" | "production") ?? "production",
      permissions: args.permissions ?? undefined,
    });

    await ctx.runMutation(components.convexAuth.native.audit.createAuthAuditEvent, {
      actorUserId: callerId,
      actorType: "user",
      eventType: "service_api_key.issued",
      targetType: "api_key",
      targetId: result.apiKeyId,
      organizationId: args.organizationId,
      metadataJson: `Service API key issued for ${args.servicePrincipalId}`,
    });

    return result;
  },
});

export const verifyApiKey = mutation({
  args: {
    key: v.string(),
  },
  returns: v.union(
    v.object({
      valid: v.literal(true),
      apiKeyId: v.string(),
      organizationId: v.optional(v.string()),
      userId: v.optional(v.string()),
      environment: v.optional(v.union(v.literal("sandbox"), v.literal("production"))),
      scopes: v.array(v.string()),
      remaining: v.optional(v.number()),
      principal: v.object({
        type: v.union(v.literal("human"), v.literal("service")),
        id: v.optional(v.string()),
        rateLimitKey: v.string(),
      }),
    }),
    v.object({
      valid: v.literal(false),
      reason: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.convexAuth.apiKeys.verifyApiKey, {
      presentedKey: args.key,
    });
  },
});
