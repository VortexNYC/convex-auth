import { query, mutation } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";

export const list = query({
  args: {
    organizationId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.string(),
      _creationTime: v.number(),
      key: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      status: v.union(v.literal("active"), v.literal("disabled")),
      permissions: v.array(v.string()),
      organizationId: v.optional(v.string()),
      createdBy: v.optional(v.string()),
      metadataJson: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.convexAuth.servicePrincipals.listServicePrincipals, {
      organizationId: args.organizationId,
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
  returns: v.object({
    servicePrincipalId: v.string(),
    created: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const result = await ctx.runMutation(
      components.convexAuth.servicePrincipals.upsertServicePrincipal,
      {
        organizationId: args.organizationId,
        createdBy: args.userId,
        key: args.key,
        name: args.name,
        description: args.description,
        permissions: args.permissions ?? ["data:read"],
      },
    );

    await ctx.runMutation(components.convexAuth.native.audit.createAuthAuditEvent, {
      actorUserId: args.userId,
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
