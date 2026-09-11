import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { components } from "./_generated/api";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

type OrganizationRoleTemplate = "owner" | "admin" | "manager" | "member" | "viewer";
type OrganizationMemberClientStatus = "active" | "pending" | "suspended";

function roleKeyToTemplate(key: string): OrganizationRoleTemplate {
  return (["owner", "admin", "manager", "member", "viewer"] as readonly string[]).includes(key)
    ? (key as OrganizationRoleTemplate)
    : "member";
}

function memberStatusToClient(
  status: "active" | "invited" | "suspended",
): OrganizationMemberClientStatus {
  switch (status) {
    case "invited":
      return "pending";
    default:
      return status;
  }
}

async function tokenHash(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateToken(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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

const memberListItemValidator = v.object({
  _id: v.string(),
  roleTemplate: v.union(
    v.literal("owner"),
    v.literal("admin"),
    v.literal("manager"),
    v.literal("member"),
    v.literal("viewer"),
  ),
  status: v.union(v.literal("active"), v.literal("pending"), v.literal("suspended")),
  createdAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
  user: v.optional(
    v.object({
      _id: v.string(),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
    }),
  ),
});

const roleListItemValidator = v.object({
  _id: v.string(),
  name: v.string(),
  key: v.optional(v.string()),
  description: v.optional(v.string()),
  permissions: v.array(v.string()),
  isSystem: v.optional(v.boolean()),
  createdAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
});

const permissionListItemValidator = v.object({
  key: v.string(),
  description: v.optional(v.string()),
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

export const listMembers = query({
  args: {},
  returns: v.array(memberListItemValidator),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const userId = identity.subject;
    const user = await ctx.runQuery(components.convexAuth.native.users.getUserById, { userId });
    const organizationId = user?.activeOrganizationId;
    if (!organizationId) return [];
    const members = await ctx.runQuery(
      components.convexAuth.organizations.listMembersByOrganization,
      { organizationId },
    );
    const results = [];
    for (const member of members) {
      const [role, memberUser] = await Promise.all([
        ctx.runQuery(components.convexAuth.organizations.getRole, {
          roleId: member.roleId,
          organizationId,
        }),
        member.userId
          ? ctx.runQuery(components.convexAuth.native.users.getUserById, { userId: member.userId })
          : Promise.resolve(null),
      ]);
      if (!role) continue;
      results.push({
        _id: member._id,
        roleTemplate: roleKeyToTemplate(role.key),
        status: memberStatusToClient(member.status),
        createdAt: member.createdAt,
        updatedAt: member.updatedAt,
        user: memberUser
          ? {
              _id: memberUser._id,
              name: memberUser.name ?? "",
              email: memberUser.email ?? undefined,
            }
          : undefined,
      });
    }
    return results;
  },
});

export const inviteMember = action({
  args: {
    organizationId: v.string(),
    email: v.string(),
    roleTemplate: v.string(),
  },
  returns: v.object({
    acceptUrl: v.string(),
    invitationId: v.string(),
    token: v.string(),
  }),
  handler: async (ctx, { organizationId, email, roleTemplate }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("UNAUTHORIZED");
    const userId = identity.subject;
    const role = await ctx.runQuery(components.convexAuth.organizations.getRoleByKey, {
      organizationId,
      key: roleTemplate,
    });
    if (!role) throw new Error("Role not found");
    const token = generateToken();
    const hash = await tokenHash(token);
    const { invitationId } = await ctx.runMutation(
      components.convexAuth.organizations.upsertInvitation,
      {
        organizationId,
        roleId: role._id,
        email,
        tokenHash: hash,
        invitedBy: userId,
        expiresAt: Date.now() + INVITATION_TTL_MS,
        status: "pending",
      },
    );
    const siteUrl =
      process.env.SITE_URL?.replace(/\/$/, "") ??
      process.env.CONVEX_SITE_URL?.replace(/\/$/, "") ??
      "http://localhost:5174";
    const acceptUrl = `${siteUrl}/accept-invitation?token=${token}`;
    return { acceptUrl, invitationId, token };
  },
});

export const suspendMember = mutation({
  args: { membershipId: v.string() },
  returns: v.object({}),
  handler: async (ctx, { membershipId }) => {
    await ctx.runMutation(components.convexAuth.organizations.setMemberStatus, {
      memberId: membershipId,
      status: "suspended",
    });
    return {};
  },
});

export const reactivateMember = mutation({
  args: { membershipId: v.string() },
  returns: v.object({}),
  handler: async (ctx, { membershipId }) => {
    await ctx.runMutation(components.convexAuth.organizations.setMemberStatus, {
      memberId: membershipId,
      status: "active",
    });
    return {};
  },
});

export const setMemberRole = mutation({
  args: {
    membershipId: v.string(),
    roleTemplate: v.string(),
  },
  returns: v.object({}),
  handler: async (ctx, { membershipId, roleTemplate }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("UNAUTHORIZED");
    const userId = identity.subject;
    const user = await ctx.runQuery(components.convexAuth.native.users.getUserById, { userId });
    const organizationId = user?.activeOrganizationId;
    if (!organizationId) throw new Error("No active organization");
    const role = await ctx.runQuery(components.convexAuth.organizations.getRoleByKey, {
      organizationId,
      key: roleTemplate,
    });
    if (!role) throw new Error("Role not found");
    await ctx.runMutation(components.convexAuth.organizations.setMemberRole, {
      memberId: membershipId,
      organizationId,
      roleId: role._id,
      assignedBy: userId,
    });
    return {};
  },
});

export const listRoles = query({
  args: {},
  returns: v.array(roleListItemValidator),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const userId = identity.subject;
    const user = await ctx.runQuery(components.convexAuth.native.users.getUserById, { userId });
    const organizationId = user?.activeOrganizationId;
    if (!organizationId) return [];
    const roles = await ctx.runQuery(components.convexAuth.organizations.listRolesByOrganization, {
      organizationId,
    });
    return roles.map((role) => ({
      _id: role._id,
      name: role.name,
      key: role.key,
      description: role.description ?? undefined,
      permissions: role.permissions,
      isSystem: role.isSystem,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    }));
  },
});

export const listPermissions = query({
  args: {},
  returns: v.array(permissionListItemValidator),
  handler: async () => {
    return [
      { key: "organization:read", description: "View workspace details" },
      { key: "organization:members:read", description: "View members" },
      { key: "organization:members:manage", description: "Invite and manage members" },
      { key: "organization:roles:read", description: "View roles" },
      { key: "organization:roles:manage", description: "Create and edit roles" },
      { key: "organization:settings:read", description: "View workspace settings" },
      { key: "organization:settings:manage", description: "Edit workspace settings" },
      { key: "organization:delete", description: "Delete the workspace" },
    ];
  },
});

export const createRole = mutation({
  args: {
    name: v.string(),
    permissions: v.array(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, { name, permissions }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("UNAUTHORIZED");
    const userId = identity.subject;
    const user = await ctx.runQuery(components.convexAuth.native.users.getUserById, { userId });
    const organizationId = user?.activeOrganizationId;
    if (!organizationId) throw new Error("No active organization");
    const { roleId } = await ctx.runMutation(components.convexAuth.organizations.ensureRole, {
      organizationId,
      key: slugify(name),
      name,
      permissions,
      isSystem: false,
    });
    return roleId;
  },
});

export const redeemInvitation = mutation({
  args: { invitationId: v.string() },
  returns: v.object({
    invitationId: v.string(),
    memberId: v.string(),
    accepted: v.boolean(),
  }),
  handler: async (ctx, { invitationId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("UNAUTHORIZED");
    const userId = identity.subject;
    const result = await ctx.runMutation(components.convexAuth.organizations.redeemInvitation, {
      invitationId,
      acceptedByUserId: userId,
    });
    return result;
  },
});

export const createOrganization = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    imageUrl: v.optional(v.union(v.string(), v.null())),
  },
  returns: organizationSummaryValidator,
  handler: async (ctx, { name, slug: slugInput, imageUrl }) => {
    const slug = slugInput || slugify(name);
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("UNAUTHORIZED");
    const userId = identity.subject;
    const user = await ctx.runQuery(components.convexAuth.native.users.getUserById, { userId });
    const { organizationId } = await ctx.runMutation(
      components.convexAuth.organizations.upsertOrganization,
      { name, slug, createdBy: userId, imageUrl },
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
