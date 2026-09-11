import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { components } from "./_generated/api";

const organizationSummaryValidator = v.object({
  _id: v.string(),
  name: v.string(),
  slug: v.string(),
  imageUrl: v.optional(v.string()),
  roleKey: v.string(),
});

const invitationSummaryValidator = v.object({
  _id: v.string(),
  organizationName: v.string(),
  organizationImageUrl: v.optional(v.string()),
  roleKey: v.string(),
  email: v.string(),
  expiresAt: v.number(),
});

export const listMyOrganizations = query({
  args: {},
  returns: v.array(organizationSummaryValidator),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const userId = identity.subject;
    const memberships = await ctx.runQuery(
      components.convexAuth.organizations.listMembershipsByUser,
      { userId },
    );
    const results = [];
    for (const membership of memberships) {
      const [org, role] = await Promise.all([
        ctx.runQuery(components.convexAuth.organizations.getOrganization, {
          organizationId: membership.organizationId,
        }),
        ctx.runQuery(components.convexAuth.organizations.getRole, {
          roleId: membership.roleId,
          organizationId: membership.organizationId,
        }),
      ]);
      if (!org || !role) continue;
      results.push({
        _id: org._id,
        name: org.name,
        slug: org.slug,
        imageUrl: org.imageUrl,
        roleKey: role.key,
      });
    }
    return results;
  },
});

export const listMyInvitations = query({
  args: {},
  returns: v.array(invitationSummaryValidator),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const userId = identity.subject;
    const user = await ctx.runQuery(components.convexAuth.native.users.getUserById, { userId });
    if (!user) return [];
    const memberships = await ctx.runQuery(
      components.convexAuth.organizations.listMembershipsByUser,
      { userId },
    );
    const invitations = [];
    for (const membership of memberships) {
      const org = await ctx.runQuery(components.convexAuth.organizations.getOrganization, {
        organizationId: membership.organizationId,
      });
      if (!org) continue;
      const orgInvitations = await ctx.runQuery(
        components.convexAuth.organizations.listInvitationsByOrganization,
        { organizationId: org._id, status: "pending" },
      );
      for (const invitation of orgInvitations) {
        if (invitation.email !== user.email) continue;
        const role = await ctx.runQuery(components.convexAuth.organizations.getRole, {
          roleId: invitation.roleId,
          organizationId: org._id,
        });
        if (!role) continue;
        invitations.push({
          _id: invitation._id,
          organizationName: org.name,
          organizationImageUrl: org.imageUrl,
          roleKey: role.key,
          email: invitation.email,
          expiresAt: invitation.expiresAt,
        });
      }
    }
    return invitations;
  },
});

export const getActiveOrganization = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.string(),
      name: v.string(),
      slug: v.string(),
      imageUrl: v.optional(v.union(v.string(), v.null())),
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject;
    const user = await ctx.runQuery(components.convexAuth.native.users.getUserById, { userId });
    if (!user?.activeOrganizationId) return null;
    const org = await ctx.runQuery(components.convexAuth.organizations.getOrganization, {
      organizationId: user.activeOrganizationId,
    });
    if (!org) return null;
    return { _id: org._id, name: org.name, slug: org.slug, imageUrl: org.imageUrl };
  },
});

export const setActiveOrganization = mutation({
  args: {
    organizationId: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({}),
  handler: async (ctx, { organizationId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("UNAUTHORIZED");
    const userId = identity.subject;
    const user = await ctx.runQuery(components.convexAuth.native.users.getUserById, { userId });
    await ctx.runMutation(components.convexAuth.organizations.setUserActiveOrganization, {
      userId,
      organizationId: organizationId ?? null,
      twoFactorEnabled: user?.twoFactorEnabled ?? false,
    });
    return {};
  },
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

export const createOrganization = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
  },
  returns: organizationSummaryValidator,
  handler: async (ctx, { name, slug: slugInput }) => {
    const slug = slugInput || slugify(name);
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("UNAUTHORIZED");
    const userId = identity.subject;
    const user = await ctx.runQuery(components.convexAuth.native.users.getUserById, { userId });
    const { organizationId } = await ctx.runMutation(
      components.convexAuth.organizations.upsertOrganization,
      { name, slug, createdBy: userId },
    );
    await ctx.runMutation(components.convexAuth.organizations.seedDefaultRoles, { organizationId });
    const ownerRole = await ctx.runQuery(components.convexAuth.organizations.getRoleByKey, {
      organizationId,
      key: "owner",
    });
    if (!ownerRole) throw new Error("Owner role not found");
    await ctx.runMutation(components.convexAuth.organizations.upsertMember, {
      organizationId,
      userId,
      roleId: ownerRole._id,
      status: "active",
    });
    await ctx.runMutation(components.convexAuth.organizations.setUserActiveOrganization, {
      userId,
      organizationId,
      twoFactorEnabled: user?.twoFactorEnabled ?? false,
    });
    return {
      _id: organizationId,
      name,
      slug,
      imageUrl: undefined,
      roleKey: ownerRole.key,
    };
  },
});
