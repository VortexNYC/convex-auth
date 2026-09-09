import { query, mutation } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";

export const list = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const memberships = await ctx.runQuery(
      components.convexAuth.organizations.listMembershipsByUser,
      { userId: args.userId },
    );
    const organizations = await Promise.all(
      memberships.map(async (membership) => {
        return await ctx.runQuery(
          components.convexAuth.organizations.getOrganization,
          { organizationId: membership.organizationId },
        );
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
    const now = Date.now();

    const { organizationId } = await ctx.runMutation(
      components.convexAuth.organizations.upsertOrganization,
      {
        name: args.name,
        slug: args.slug,
        createdBy: args.userId,
      },
    );

    await ctx.runMutation(
      components.convexAuth.organizations.seedDefaultRoles,
      {
        organizationId,
        createdBy: args.userId,
      },
    );

    const ownerRole = await ctx.runQuery(
      components.convexAuth.organizations.getRoleByKey,
      { organizationId, key: "owner" },
    );
    if (!ownerRole) return null;

    await ctx.runMutation(
      components.convexAuth.organizations.upsertMember,
      {
        organizationId,
        userId: args.userId,
        roleId: ownerRole._id,
        status: "active",
        assignedBy: args.userId,
        acceptedAt: now,
      },
    );

    return { organizationId };
  },
});
