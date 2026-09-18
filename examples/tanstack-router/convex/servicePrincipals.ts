import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { components } from "./_generated/api";

const servicePrincipalListItemValidator = v.object({
  _id: v.string(),
  key: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  status: v.union(v.literal("active"), v.literal("disabled")),
  permissions: v.array(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  createdBy: v.optional(
    v.union(
      v.null(),
      v.object({
        _id: v.string(),
        name: v.optional(v.string()),
        email: v.string(),
      }),
    ),
  ),
});

const createdServicePrincipalValidator = v.object({
  servicePrincipalId: v.string(),
  created: v.boolean(),
});

export const listMyServicePrincipals = query({
  args: {},
  returns: v.array(servicePrincipalListItemValidator),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const userId = identity.subject;
    const user = await ctx.runQuery(components.convexAuth.native.users.getUserById, { userId });
    const organizationId = user?.activeOrganizationId;
    if (!organizationId) return [];
    const principals = await ctx.runQuery(
      components.convexAuth.servicePrincipals.listServicePrincipals,
      { organizationId, limit: 100 },
    );
    const results = [];
    for (const principal of principals) {
      const creator = principal.createdBy
        ? await ctx.runQuery(components.convexAuth.native.users.getUserById, {
            userId: principal.createdBy,
          })
        : null;
      results.push({
        _id: principal._id,
        key: principal.key,
        name: principal.name,
        description: principal.description,
        status: principal.status,
        permissions: principal.permissions,
        createdAt: principal.createdAt,
        updatedAt: principal.updatedAt,
        createdBy: creator
          ? {
              _id: creator._id,
              name: creator.name,
              email: creator.email,
            }
          : null,
      });
    }
    return results;
  },
});

export const createServicePrincipal = mutation({
  args: {
    key: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    permissions: v.array(v.string()),
  },
  returns: createdServicePrincipalValidator,
  handler: async (ctx, { key, name, description, permissions }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("UNAUTHORIZED");
    const userId = identity.subject;
    const user = await ctx.runQuery(components.convexAuth.native.users.getUserById, { userId });
    const organizationId = user?.activeOrganizationId;
    if (!organizationId) throw new Error("No active workspace");
    const { servicePrincipalId, created } = await ctx.runMutation(
      components.convexAuth.servicePrincipals.upsertServicePrincipal,
      {
        key,
        name,
        description,
        organizationId,
        permissions,
        createdBy: userId,
      },
    );
    return { servicePrincipalId, created };
  },
});

export const updateServicePrincipal = mutation({
  args: {
    servicePrincipalId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    permissions: v.optional(v.array(v.string())),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, { servicePrincipalId, name, description, permissions }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("UNAUTHORIZED");
    const userId = identity.subject;
    const user = await ctx.runQuery(components.convexAuth.native.users.getUserById, { userId });
    const organizationId = user?.activeOrganizationId;
    if (!organizationId) throw new Error("No active workspace");
    await ctx.runMutation(components.convexAuth.servicePrincipals.setServicePrincipalDetails, {
      servicePrincipalId,
      actingOrganizationId: organizationId,
      name,
      description,
      permissions,
    });
    return { ok: true as const };
  },
});

export const setServicePrincipalStatus = mutation({
  args: {
    servicePrincipalId: v.string(),
    status: v.union(v.literal("active"), v.literal("disabled")),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, { servicePrincipalId, status }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("UNAUTHORIZED");
    const userId = identity.subject;
    const user = await ctx.runQuery(components.convexAuth.native.users.getUserById, { userId });
    const organizationId = user?.activeOrganizationId;
    if (!organizationId) throw new Error("No active workspace");
    await ctx.runMutation(components.convexAuth.servicePrincipals.setServicePrincipalStatus, {
      servicePrincipalId,
      actingOrganizationId: organizationId,
      status,
    });
    return { ok: true as const };
  },
});
