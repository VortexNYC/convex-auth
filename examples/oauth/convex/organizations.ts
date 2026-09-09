import { query, mutation } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.runQuery(components.convexAuthOrganizations.organizations.listOrganizations, {
      limit: 100,
    });
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.runMutation(components.convexAuthOrganizations.organizations.upsertOrganization, {
      name: args.name,
      slug: args.slug,
      createdBy: identity.subject,
    });
  },
});
