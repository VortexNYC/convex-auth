import { query, mutation } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";
import { requireMatchingUserId } from "./authz";

export const list = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    await requireMatchingUserId(ctx, args.userId);
    const memberships = await ctx.runQuery(
      components.convexAuth.organizations.listMembershipsByUser,
      { userId: args.userId },
    );
    const organizations = await Promise.all(
      memberships.map(async (membership) => {
        return await ctx.runQuery(components.convexAuth.organizations.getOrganization, {
          organizationId: membership.organizationId,
        });
      }),
    );
    return organizations.filter((org) => org !== null);
  },
});

export const create = mutation({
  args: {
    userId: v.string(),
    name: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const callerId = await requireMatchingUserId(ctx, args.userId);
    const now = Date.now();

    const { organizationId } = await ctx.runMutation(
      components.convexAuth.organizations.upsertOrganization,
      {
        name: args.name,
        slug: args.slug,
        createdBy: callerId,
      },
    );

    await ctx.runMutation(components.convexAuth.organizations.seedDefaultRoles, {
      organizationId,
      createdBy: callerId,
    });

    const ownerRole = await ctx.runQuery(components.convexAuth.organizations.getRoleByKey, {
      organizationId,
      key: "owner",
    });
    if (!ownerRole) return null;

    await ctx.runMutation(components.convexAuth.organizations.upsertMember, {
      organizationId,
      userId: callerId,
      roleId: ownerRole._id,
      status: "active",
      assignedBy: callerId,
      acceptedAt: now,
    });

    return { organizationId };
  },
});
