import { v } from "convex/values";
import { getPage } from "convex-helpers/server/pagination";
import { getOneFrom } from "convex-helpers/server/relationships";

import type { Doc, Id } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { mutation, query } from "./_generated/server.js";
import schema, {
  invitationEmailDeliveryStatusValidator,
  organizationInvitationStatusValidator,
  organizationMemberStatusValidator,
  organizationStatusValidator,
} from "./schema.js";
import { fanOutConvexWebhookEvent } from "./webhooks.js";
import { parseOrganizationSecurityPolicy } from "../convex-runtime/organization/organizationSecurityPolicy.js";

type DbCtx = Pick<MutationCtx | QueryCtx, "db">;
type OrganizationDetailsPatch = Partial<
  Pick<Doc<"organizations">, "name" | "slug" | "imageUrl" | "metadataJson">
> &
  Pick<Doc<"organizations">, "updatedAt">;

const ORGANIZATION_SECURITY_METADATA_KEY = "security";
const SESSION_TIMEOUT_MIN = 15;
const SESSION_TIMEOUT_MAX = 1440;

function isMetadataRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSessionTimeoutMinutes(value: number): number {
  const rounded = Math.round(value);
  if (rounded < SESSION_TIMEOUT_MIN || rounded > SESSION_TIMEOUT_MAX) {
    throw new Error(
      `sessionTimeoutMinutes must be between ${SESSION_TIMEOUT_MIN} and ${SESSION_TIMEOUT_MAX}`,
    );
  }
  return rounded;
}

function mergeSecurityIntoMetadataJson(
  metadataJson: string | undefined,
  securityUpdate: {
    requireMfa?: boolean | null;
    sessionTimeoutMinutes?: number | null;
  },
): string | undefined {
  let base: Record<string, unknown> = {};
  if (metadataJson && metadataJson.trim() !== "") {
    try {
      const parsed: unknown = JSON.parse(metadataJson);
      if (isMetadataRecord(parsed)) {
        base = { ...parsed };
      }
    } catch {
      base = {};
    }
  }

  const current = isMetadataRecord(base[ORGANIZATION_SECURITY_METADATA_KEY])
    ? { ...base[ORGANIZATION_SECURITY_METADATA_KEY] }
    : {};

  if ("requireMfa" in securityUpdate) {
    if (securityUpdate.requireMfa === null || securityUpdate.requireMfa === undefined) {
      delete current.requireMfa;
    } else {
      current.requireMfa = securityUpdate.requireMfa;
    }
  }
  if ("sessionTimeoutMinutes" in securityUpdate) {
    if (
      securityUpdate.sessionTimeoutMinutes === null ||
      securityUpdate.sessionTimeoutMinutes === undefined
    ) {
      delete current.sessionTimeoutMinutes;
    } else {
      current.sessionTimeoutMinutes = normalizeSessionTimeoutMinutes(
        securityUpdate.sessionTimeoutMinutes,
      );
    }
  }

  if (Object.keys(current).length === 0) {
    delete base[ORGANIZATION_SECURITY_METADATA_KEY];
  } else {
    base[ORGANIZATION_SECURITY_METADATA_KEY] = current;
  }

  if (Object.keys(base).length === 0) {
    return undefined;
  }
  return JSON.stringify(base);
}

const organizationResultValidator = v.object({
  organizationId: v.id("organizations"),
  created: v.boolean(),
});

const organizationDocValidator = v.object({
  _id: v.id("organizations"),
  _creationTime: v.number(),
  name: v.string(),
  slug: v.string(),
  imageUrl: v.optional(v.string()),
  status: organizationStatusValidator,
  createdBy: v.optional(v.id("users")),
  metadataJson: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const roleResultValidator = v.object({
  roleId: v.id("organization_roles"),
  created: v.boolean(),
});

const roleDocValidator = v.object({
  _id: v.id("organization_roles"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  key: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  permissions: v.array(v.string()),
  isSystem: v.boolean(),
  createdBy: v.optional(v.id("users")),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const memberResultValidator = v.object({
  memberId: v.id("organization_members"),
  created: v.boolean(),
});

const memberDocValidator = v.object({
  _id: v.id("organization_members"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  userId: v.optional(v.id("users")),
  roleId: v.id("organization_roles"),
  status: organizationMemberStatusValidator,
  invitedEmail: v.optional(v.string()),
  invitedBy: v.optional(v.id("users")),
  assignedBy: v.optional(v.id("users")),
  invitedAt: v.optional(v.number()),
  acceptedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const invitationResultValidator = v.object({
  invitationId: v.id("organization_invitations"),
  created: v.boolean(),
});

const redeemInvitationResultValidator = v.object({
  invitationId: v.id("organization_invitations"),
  memberId: v.id("organization_members"),
  accepted: v.boolean(),
});

const invitationDocValidator = v.object({
  _id: v.id("organization_invitations"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  roleId: v.id("organization_roles"),
  email: v.string(),
  tokenHash: v.string(),
  status: organizationInvitationStatusValidator,
  invitedBy: v.id("users"),
  expiresAt: v.number(),
  acceptedByUserId: v.optional(v.id("users")),
  acceptedAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
  emailId: v.optional(v.string()),
  emailDeliveryStatus: v.optional(invitationEmailDeliveryStatusValidator),
  emailDeliveryEvent: v.optional(v.string()),
  emailDeliveryError: v.optional(v.string()),
  emailDeliveryUpdatedAt: v.optional(v.number()),
  metadataJson: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const okResultValidator = v.object({ ok: v.literal(true) });

function okResult() {
  return { ok: true } as const;
}

/**
 * Emit a canonical Gap A webhook event as a side effect of an org/member/
 * invitation mutation. The component is the source of truth that drives
 * consumer read-caches, so each mutation fans the event out to subscribed
 * endpoints after its DB write. Payloads never contain secrets (tokens,
 * tokenHash).
 */
async function emitOrganizationEvent(
  ctx: MutationCtx,
  args: {
    eventType: string;
    organizationId: Id<"organizations">;
    data: Record<string, unknown>;
  },
): Promise<void> {
  const eventId = crypto.randomUUID();
  await fanOutConvexWebhookEvent(ctx, {
    eventType: args.eventType,
    eventId,
    organizationId: args.organizationId,
    payloadJson: JSON.stringify({
      id: eventId,
      type: args.eventType,
      data: args.data,
    }),
  });
}

export const upsertOrganization = mutation({
  args: {
    organizationId: v.optional(v.id("organizations")),
    name: v.string(),
    slug: v.string(),
    imageUrl: v.optional(v.union(v.string(), v.null())),
    status: v.optional(organizationStatusValidator),
    createdBy: v.optional(v.id("users")),
    metadataJson: v.optional(v.union(v.string(), v.null())),
  },
  returns: organizationResultValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const slug = normalizeRequired(args.slug, "slug");
    const name = normalizeRequired(args.name, "name");
    const existing =
      (args.organizationId ? await ctx.db.get("organizations", args.organizationId) : null) ??
      (await findOrganizationBySlug(ctx, slug));
    const patch = {
      name,
      slug,
      imageUrl: args.imageUrl ?? undefined,
      status: args.status ?? existing?.status ?? "active",
      createdBy: args.createdBy ?? existing?.createdBy,
      metadataJson: args.metadataJson ?? undefined,
      updatedAt: now,
    };

    if (existing !== null) {
      await ctx.db.patch("organizations", existing._id, patch);
      await emitOrganizationEvent(ctx, {
        eventType: "organization.updated",
        organizationId: existing._id,
        data: {
          organizationId: existing._id,
          name,
          slug,
          status: patch.status,
        },
      });
      return { organizationId: existing._id, created: false };
    }

    const organizationId = await ctx.db.insert("organizations", {
      ...patch,
      createdAt: now,
    });
    await emitOrganizationEvent(ctx, {
      eventType: "organization.created",
      organizationId,
      data: { organizationId, name, slug, status: patch.status },
    });
    return { organizationId, created: true };
  },
});

export const getOrganization = query({
  args: {
    organizationId: v.id("organizations"),
  },
  returns: v.union(v.null(), organizationDocValidator),
  handler: async (ctx, { organizationId }) => {
    return await ctx.db.get("organizations", organizationId);
  },
});

export const getOrganizationBySlug = query({
  args: {
    slug: v.string(),
  },
  returns: v.union(v.null(), organizationDocValidator),
  handler: async (ctx, { slug }) => {
    return await findOrganizationBySlug(ctx, slug);
  },
});

export const listOrganizations = query({
  args: {
    status: v.optional(organizationStatusValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(organizationDocValidator),
  handler: async (ctx, { status, limit }) => {
    const resolvedLimit = resolveListLimit(limit);
    if (status === undefined) {
      const { page } = await getPage(ctx, {
        table: "organizations",
        absoluteMaxRows: resolvedLimit,
      });
      return page;
    }
    const { page } = await getPage(ctx, {
      table: "organizations",
      index: "by_status",
      startIndexKey: [status],
      endIndexKey: [status],
      absoluteMaxRows: resolvedLimit,
      schema,
    });
    return page;
  },
});

const organizationBrandUpdateValidator = v.object({
  primaryColor: v.optional(v.union(v.string(), v.null())),
  accentColor: v.optional(v.union(v.string(), v.null())),
  website: v.optional(v.union(v.string(), v.null())),
  emailFromName: v.optional(v.union(v.string(), v.null())),
  emailReplyTo: v.optional(v.union(v.string(), v.null())),
});

const ORGANIZATION_BRAND_METADATA_KEY = "brand";

function mergeBrandIntoMetadataJson(
  metadataJson: string | undefined,
  brandUpdate: {
    primaryColor?: string | null;
    accentColor?: string | null;
    website?: string | null;
    emailFromName?: string | null;
    emailReplyTo?: string | null;
  },
): string | undefined {
  let base: Record<string, unknown> = {};
  if (metadataJson && metadataJson.trim() !== "") {
    try {
      const parsed: unknown = JSON.parse(metadataJson);
      if (isMetadataRecord(parsed)) {
        base = { ...parsed };
      }
    } catch {
      base = {};
    }
  }

  const currentBrand = isMetadataRecord(base[ORGANIZATION_BRAND_METADATA_KEY])
    ? { ...base[ORGANIZATION_BRAND_METADATA_KEY] }
    : {};

  const keys = ["primaryColor", "accentColor", "website", "emailFromName", "emailReplyTo"] as const;
  for (const key of keys) {
    if (!(key in brandUpdate)) {
      continue;
    }
    const value = brandUpdate[key];
    if (value === null || value === undefined || value.trim() === "") {
      delete currentBrand[key];
    } else {
      currentBrand[key] = value.trim();
    }
  }

  if (Object.keys(currentBrand).length === 0) {
    delete base[ORGANIZATION_BRAND_METADATA_KEY];
  } else {
    base[ORGANIZATION_BRAND_METADATA_KEY] = currentBrand;
  }

  if (Object.keys(base).length === 0) {
    return undefined;
  }
  return JSON.stringify(base);
}

export const setOrganizationDetails = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    imageUrl: v.optional(v.union(v.string(), v.null())),
    metadataJson: v.optional(v.union(v.string(), v.null())),
    /** Suite tenant brand (VOR-182). Merged into metadataJson.brand. */
    brand: v.optional(organizationBrandUpdateValidator),
    /** Suite org security policy (VOR-183). Merged into metadataJson.security. */
    security: v.optional(
      v.object({
        requireMfa: v.optional(v.union(v.boolean(), v.null())),
        sessionTimeoutMinutes: v.optional(v.union(v.number(), v.null())),
      }),
    ),
  },
  returns: okResultValidator,
  handler: async (ctx, args) => {
    const organization = await requireOrganization(ctx, args.organizationId);
    const patch: OrganizationDetailsPatch = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) {
      patch.name = normalizeRequired(args.name, "name");
    }
    if (args.slug !== undefined) {
      const slug = normalizeRequired(args.slug, "slug");
      const existingWithSlug = await findOrganizationBySlug(ctx, slug);
      if (existingWithSlug !== null && existingWithSlug._id !== organization._id) {
        throw new Error("Organization slug already exists");
      }
      patch.slug = slug;
    }
    if (args.imageUrl !== undefined) {
      patch.imageUrl = normalizeOptional(args.imageUrl);
    }

    if (
      args.metadataJson !== undefined &&
      (args.brand !== undefined || args.security !== undefined)
    ) {
      throw new Error("Pass either metadataJson or brand/security fields, not both");
    }
    if (args.metadataJson !== undefined) {
      patch.metadataJson = normalizeOptional(args.metadataJson);
    } else if (args.brand !== undefined || args.security !== undefined) {
      let nextMetadata = organization.metadataJson;
      if (args.brand !== undefined) {
        nextMetadata = mergeBrandIntoMetadataJson(nextMetadata, args.brand);
      }
      if (args.security !== undefined) {
        nextMetadata = mergeSecurityIntoMetadataJson(nextMetadata, args.security);
      }
      patch.metadataJson = nextMetadata;
    }

    await ctx.db.patch("organizations", organization._id, patch);
    await emitOrganizationEvent(ctx, {
      eventType: "organization.updated",
      organizationId: organization._id,
      data: { organizationId: organization._id },
    });
    return okResult();
  },
});

export const setOrganizationStatus = mutation({
  args: {
    organizationId: v.id("organizations"),
    status: organizationStatusValidator,
  },
  returns: okResultValidator,
  handler: async (ctx, { organizationId, status }) => {
    await requireOrganization(ctx, organizationId);
    await ctx.db.patch("organizations", organizationId, {
      status,
      updatedAt: Date.now(),
    });
    await emitOrganizationEvent(ctx, {
      eventType: "organization.updated",
      organizationId,
      data: { organizationId, status },
    });
    return okResult();
  },
});

export const setUserActiveOrganization = mutation({
  args: {
    userId: v.id("users"),
    organizationId: v.union(v.id("organizations"), v.null()),
    /**
     * Caller-attested legacy auth provider `user.twoFactorEnabled` (VOR-183).
     * Required to be true when the target org has `security.requireMfa`.
     * Trusted callers (glue / consumer auth wrappers) must read this from
     * the legacy auth user row — never from the client alone.
     */
    twoFactorEnabled: v.optional(v.boolean()),
  },
  returns: okResultValidator,
  handler: async (ctx, { userId, organizationId, twoFactorEnabled }) => {
    const user = await requireUser(ctx, userId);
    if (organizationId === null) {
      await ctx.db.patch("users", user._id, {
        activeOrganizationId: undefined,
        updatedAt: Date.now(),
      });
      return okResult();
    }

    const organization = await requireOrganization(ctx, organizationId);
    const member = await findMemberByUserOrganization(ctx, userId, organizationId);
    if (member === null || member.status !== "active") {
      throw new Error("Active organization membership not found");
    }

    const policy = parseOrganizationSecurityPolicy(organization.metadataJson);
    if (policy.requireMfa && twoFactorEnabled !== true) {
      throw new Error(
        "This organization requires two-factor authentication. Enable TOTP on your account, then try again.",
      );
    }

    await ctx.db.patch("users", user._id, {
      activeOrganizationId: organizationId,
      updatedAt: Date.now(),
    });
    return okResult();
  },
});

type EnsureRoleArgs = {
  organizationId: Id<"organizations">;
  key: string;
  name: string;
  description?: string | null;
  permissions: string[];
  isSystem?: boolean;
  createdBy?: Id<"users">;
};

async function ensureRoleInner(
  ctx: MutationCtx,
  args: EnsureRoleArgs,
): Promise<{ roleId: Id<"organization_roles">; created: boolean }> {
  await requireOrganization(ctx, args.organizationId);

  const now = Date.now();
  const key = normalizeRequired(args.key, "key");
  const name = normalizeRequired(args.name, "name");
  const existing = await findRoleByKey(ctx, args.organizationId, key);
  if (existing !== null && args.isSystem !== undefined && args.isSystem !== existing.isSystem) {
    throw new Error("Organization role system flag cannot be changed");
  }
  const patch = {
    organizationId: args.organizationId,
    key,
    name,
    description:
      args.description === undefined ? existing?.description : normalizeOptional(args.description),
    permissions: args.permissions,
    isSystem: args.isSystem ?? existing?.isSystem ?? false,
    createdBy: args.createdBy ?? existing?.createdBy,
    updatedAt: now,
  };

  if (existing !== null) {
    await ctx.db.patch("organization_roles", existing._id, patch);
    return { roleId: existing._id, created: false };
  }

  const roleId = await ctx.db.insert("organization_roles", {
    ...patch,
    createdAt: now,
  });
  return { roleId, created: true };
}

export const ensureRole = mutation({
  args: {
    organizationId: v.id("organizations"),
    key: v.string(),
    name: v.string(),
    description: v.optional(v.union(v.string(), v.null())),
    permissions: v.array(v.string()),
    isSystem: v.optional(v.boolean()),
    createdBy: v.optional(v.id("users")),
  },
  returns: roleResultValidator,
  handler: async (ctx, args) => ensureRoleInner(ctx, args),
});

const DEFAULT_SEED_ROLE_CATALOG: ReadonlyArray<{
  key: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
}> = [
  {
    key: "owner",
    name: "Owner",
    description: "Full control over the organization, including billing and deletion.",
    permissions: ["*"],
    isSystem: true,
  },
  {
    key: "member",
    name: "Member",
    description: "Baseline access for an organization member.",
    permissions: ["organization:read", "organization:members:read"],
    isSystem: false,
  },
];

export const seedDefaultRoles = mutation({
  args: {
    organizationId: v.id("organizations"),
    createdBy: v.optional(v.id("users")),
    catalog: v.optional(
      v.array(
        v.object({
          key: v.string(),
          name: v.string(),
          description: v.optional(v.string()),
          permissions: v.array(v.string()),
          isSystem: v.optional(v.boolean()),
        }),
      ),
    ),
  },
  returns: v.object({
    roleIds: v.array(v.id("organization_roles")),
    seeded: v.number(),
  }),
  handler: async (ctx, args) => {
    const catalog = args.catalog ?? DEFAULT_SEED_ROLE_CATALOG;
    const roleIds = await Promise.all(
      catalog.map(async (definition) => {
        const result = await ensureRoleInner(ctx, {
          organizationId: args.organizationId,
          key: definition.key,
          name: definition.name,
          description: definition.description,
          permissions: definition.permissions,
          isSystem: definition.isSystem,
          createdBy: args.createdBy,
        });
        return result.roleId;
      }),
    );
    return { roleIds, seeded: roleIds.length };
  },
});

export const deleteRole = mutation({
  args: {
    roleId: v.id("organization_roles"),
    organizationId: v.id("organizations"),
  },
  returns: okResultValidator,
  handler: async (ctx, { roleId, organizationId }) => {
    const role = await requireRoleById(ctx, roleId);
    if (role.organizationId !== organizationId) {
      // Cross-organization IDOR guard: a role id from another tenant must not
      // be deletable by a caller acting in this org.
      throw new Error("Organization role not found");
    }
    if (role.isSystem) {
      throw new Error("System organization roles cannot be deleted");
    }

    const { page: membersUsingRole } = await getPage(ctx, {
      table: "organization_members",
      index: "by_role",
      startIndexKey: [role._id],
      endIndexKey: [role._id],
      absoluteMaxRows: 1,
      schema,
    });
    if (membersUsingRole.length > 0) {
      throw new Error("Organization role is assigned to members");
    }

    const { page: invitationsUsingRole } = await getPage(ctx, {
      table: "organization_invitations",
      index: "by_role",
      startIndexKey: [role._id],
      endIndexKey: [role._id],
      absoluteMaxRows: 1,
      schema,
    });
    if (invitationsUsingRole.length > 0) {
      throw new Error("Organization role is assigned to invitations");
    }

    await ctx.db.delete("organization_roles", role._id);
    return okResult();
  },
});

// Tenant-scoped read: the DEFAULT, safe-by-construction reader. A role id from
// another org does not resolve (returns null, no existence leak). This is what a
// tenant-facing wrapper should reach for — pass the caller's own org.
export const getRole = query({
  args: {
    roleId: v.id("organization_roles"),
    organizationId: v.id("organizations"),
  },
  returns: v.union(v.null(), roleDocValidator),
  handler: async (ctx, { roleId, organizationId }) => {
    const role = await ctx.db.get("organization_roles", roleId);
    if (role === null || role.organizationId !== organizationId) {
      return null;
    }
    return role;
  },
});

export const getRoleByKey = query({
  args: {
    organizationId: v.id("organizations"),
    key: v.string(),
  },
  returns: v.union(v.null(), roleDocValidator),
  handler: async (ctx, { organizationId, key }) => {
    return await findRoleByKey(ctx, organizationId, key);
  },
});

export const listRolesByOrganization = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  returns: v.array(roleDocValidator),
  handler: async (ctx, { organizationId, limit }) => {
    const { page } = await getPage(ctx, {
      table: "organization_roles",
      index: "by_organization",
      startIndexKey: [organizationId],
      endIndexKey: [organizationId],
      absoluteMaxRows: resolveListLimit(limit),
      schema,
    });
    return page;
  },
});

export const setRoleDetails = mutation({
  args: {
    roleId: v.id("organization_roles"),
    name: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    permissions: v.optional(v.array(v.string())),
    isSystem: v.optional(v.boolean()),
  },
  returns: okResultValidator,
  handler: async (ctx, args) => {
    const role = await requireRoleById(ctx, args.roleId);
    if (role.isSystem) {
      throw new Error("System organization roles cannot be modified");
    }
    if (args.isSystem !== undefined && args.isSystem !== role.isSystem) {
      throw new Error("Organization role system flag cannot be changed");
    }
    await ctx.db.patch("organization_roles", role._id, {
      name: args.name === undefined ? role.name : normalizeRequired(args.name, "name"),
      description:
        args.description === undefined ? role.description : normalizeOptional(args.description),
      permissions: args.permissions ?? role.permissions,
      isSystem: role.isSystem,
      updatedAt: Date.now(),
    });
    return okResult();
  },
});

export const upsertMember = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.optional(v.id("users")),
    roleId: v.id("organization_roles"),
    status: v.optional(organizationMemberStatusValidator),
    invitedEmail: v.optional(v.union(v.string(), v.null())),
    invitedBy: v.optional(v.id("users")),
    assignedBy: v.optional(v.id("users")),
    invitedAt: v.optional(v.number()),
    acceptedAt: v.optional(v.number()),
  },
  returns: memberResultValidator,
  handler: async (ctx, args) => {
    await requireOrganization(ctx, args.organizationId);
    await requireRole(ctx, args.roleId, args.organizationId);
    return await upsertOrganizationMemberRecord(ctx, args);
  },
});

export const getMemberByUserOrganization = query({
  args: {
    userId: v.id("users"),
    organizationId: v.id("organizations"),
  },
  returns: v.union(v.null(), memberDocValidator),
  handler: async (ctx, args) => {
    return await findMemberByUserOrganization(ctx, args.userId, args.organizationId);
  },
});

// Tenant-scoped read (DEFAULT, safe-by-construction). A member id from another
// org does not resolve. Tenant-facing wrappers pass the caller's own org.
export const getMember = query({
  args: {
    memberId: v.id("organization_members"),
    organizationId: v.id("organizations"),
  },
  returns: v.union(v.null(), memberDocValidator),
  handler: async (ctx, { memberId, organizationId }) => {
    const member = await ctx.db.get("organization_members", memberId);
    if (member === null || member.organizationId !== organizationId) {
      return null;
    }
    return member;
  },
});

// Unscoped member lookup for internal server-side use only — e.g. when the
// caller has a component member id but has not yet resolved the org.
// Never expose this from a client-facing query/mutation.
export const getMemberByIdForSystem = query({
  args: {
    memberId: v.id("organization_members"),
  },
  returns: v.union(v.null(), memberDocValidator),
  handler: async (ctx, { memberId }) => {
    return await ctx.db.get("organization_members", memberId);
  },
});

export const getInvitedMemberByEmail = query({
  args: {
    organizationId: v.id("organizations"),
    invitedEmail: v.string(),
  },
  returns: v.union(v.null(), memberDocValidator),
  handler: async (ctx, { organizationId, invitedEmail }) => {
    return await findInvitedMember(ctx, organizationId, normalizeRequiredEmail(invitedEmail));
  },
});

export const listMembersByOrganization = query({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(organizationMemberStatusValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(memberDocValidator),
  handler: async (ctx, { organizationId, status, limit }) => {
    const resolvedLimit = resolveListLimit(limit);
    const index = status === undefined ? "by_organization" : "by_org_status";
    const startIndexKey = status === undefined ? [organizationId] : [organizationId, status];
    const { page } = await getPage(ctx, {
      table: "organization_members",
      index,
      startIndexKey,
      endIndexKey: startIndexKey,
      absoluteMaxRows: resolvedLimit,
      schema,
    });
    return page;
  },
});

export const listMembershipsByUser = query({
  args: {
    userId: v.id("users"),
    status: v.optional(organizationMemberStatusValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(memberDocValidator),
  handler: async (ctx, { userId, status, limit }) => {
    const { page: rows } = await getPage(ctx, {
      table: "organization_members",
      index: "by_user",
      startIndexKey: [userId],
      endIndexKey: [userId],
      absoluteMaxRows: resolveListLimit(limit),
      schema,
    });
    return status === undefined ? rows : rows.filter((m) => m.status === status);
  },
});

export const setMemberRole = mutation({
  args: {
    memberId: v.id("organization_members"),
    organizationId: v.id("organizations"),
    roleId: v.id("organization_roles"),
    assignedBy: v.optional(v.id("users")),
  },
  returns: okResultValidator,
  handler: async (ctx, { memberId, organizationId, roleId, assignedBy }) => {
    const member = await requireMember(ctx, memberId);
    if (member.organizationId !== organizationId) {
      // Cross-organization IDOR guard: prevents granting a role to a member of
      // another tenant (privilege escalation across the org boundary).
      throw new Error("Organization member not found");
    }
    // requireRole binds the role to the member's org, so once the member is
    // confirmed in `organizationId`, the role is necessarily in it too.
    await requireRole(ctx, roleId, member.organizationId);
    await ctx.db.patch("organization_members", memberId, {
      roleId,
      assignedBy: assignedBy ?? member.assignedBy,
      updatedAt: Date.now(),
    });
    await emitOrganizationEvent(ctx, {
      eventType: "member.role_changed",
      organizationId: member.organizationId,
      data: { organizationId: member.organizationId, memberId, roleId },
    });
    return okResult();
  },
});

export const setMemberStatus = mutation({
  args: {
    memberId: v.id("organization_members"),
    status: organizationMemberStatusValidator,
    acceptedAt: v.optional(v.number()),
  },
  returns: okResultValidator,
  handler: async (ctx, { memberId, status, acceptedAt }) => {
    const member = await requireMember(ctx, memberId);
    const now = Date.now();
    const previousStatus = member.status;
    await ctx.db.patch("organization_members", memberId, {
      status,
      acceptedAt: acceptedAt ?? member.acceptedAt ?? (status === "active" ? now : undefined),
      updatedAt: now,
    });
    if (status === "suspended") {
      await emitOrganizationEvent(ctx, {
        eventType: "member.removed",
        organizationId: member.organizationId,
        data: { organizationId: member.organizationId, memberId, status },
      });
    } else if (status === "active" && previousStatus !== "active") {
      await emitOrganizationEvent(ctx, {
        eventType: "member.added",
        organizationId: member.organizationId,
        data: { organizationId: member.organizationId, memberId, status },
      });
    }
    return okResult();
  },
});

export const upsertInvitation = mutation({
  args: {
    invitationId: v.optional(v.id("organization_invitations")),
    organizationId: v.id("organizations"),
    roleId: v.id("organization_roles"),
    email: v.string(),
    tokenHash: v.string(),
    status: v.optional(organizationInvitationStatusValidator),
    invitedBy: v.id("users"),
    expiresAt: v.number(),
    acceptedByUserId: v.optional(v.id("users")),
    acceptedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    emailId: v.optional(v.union(v.string(), v.null())),
    emailDeliveryStatus: v.optional(invitationEmailDeliveryStatusValidator),
    emailDeliveryEvent: v.optional(v.union(v.string(), v.null())),
    emailDeliveryError: v.optional(v.union(v.string(), v.null())),
    emailDeliveryUpdatedAt: v.optional(v.number()),
    metadataJson: v.optional(v.union(v.string(), v.null())),
  },
  returns: invitationResultValidator,
  handler: async (ctx, args) => {
    await requireOrganization(ctx, args.organizationId);
    await requireRole(ctx, args.roleId, args.organizationId);
    await requireUser(ctx, args.invitedBy);
    return await upsertOrganizationInvitationRecord(ctx, args);
  },
});

export const getInvitationByTokenHash = query({
  args: {
    tokenHash: v.string(),
  },
  returns: v.union(v.null(), invitationDocValidator),
  handler: async (ctx, { tokenHash }) => {
    return await findInvitationByTokenHash(ctx, tokenHash);
  },
});

export const getInvitationByEmailId = query({
  args: {
    emailId: v.string(),
  },
  returns: v.union(v.null(), invitationDocValidator),
  handler: async (ctx, { emailId }) => {
    return await getOneFrom(ctx.db, "organization_invitations", "by_email_id", emailId, "emailId");
  },
});

// Tenant-scoped read (DEFAULT, safe-by-construction). An invitation id from
// another org does not resolve — invitee email/role/expiry never leak cross-org.
// Tenant-facing wrappers pass the caller's own org. For the genuine
// "resolve an invitation by id to DISCOVER its org" system flow (which cannot
// pre-supply the org), use `getInvitationByIdForSystem` below.
export const getInvitation = query({
  args: {
    invitationId: v.id("organization_invitations"),
    organizationId: v.id("organizations"),
  },
  returns: v.union(v.null(), invitationDocValidator),
  handler: async (ctx, { invitationId, organizationId }) => {
    const invitation = await ctx.db.get("organization_invitations", invitationId);
    if (invitation === null || invitation.organizationId !== organizationId) {
      return null;
    }
    return invitation;
  },
});

// EXPLICITLY UNSCOPED system reader. The ONLY legitimate use is resolving an
// invitation by id to discover the org it belongs to (you cannot scope a read by
// the very value you are trying to learn) — e.g. an invitation-email render or a
// provider delivery webhook that carries only the id. The deliberately verbose,
// greppable name makes any tenant-facing misuse obvious in review/CI. NEVER call
// this from a client-exposed `query`/`mutation`; use `getInvitation` (scoped) or
// the org-scoped list/lookup queries instead.
export const getInvitationByIdForSystem = query({
  args: {
    invitationId: v.id("organization_invitations"),
  },
  returns: v.union(v.null(), invitationDocValidator),
  handler: async (ctx, { invitationId }) => {
    return await ctx.db.get("organization_invitations", invitationId);
  },
});

export const listInvitationsByOrganization = query({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(organizationInvitationStatusValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(invitationDocValidator),
  handler: async (ctx, { organizationId, status, limit }) => {
    const resolvedLimit = resolveListLimit(limit);
    const index = status === undefined ? "by_organization" : "by_org_status";
    const startIndexKey = status === undefined ? [organizationId] : [organizationId, status];
    const { page } = await getPage(ctx, {
      table: "organization_invitations",
      index,
      startIndexKey,
      endIndexKey: startIndexKey,
      absoluteMaxRows: resolvedLimit,
      schema,
    });
    return page;
  },
});

export const setInvitationStatus = mutation({
  args: {
    invitationId: v.id("organization_invitations"),
    organizationId: v.id("organizations"),
    status: organizationInvitationStatusValidator,
    acceptedByUserId: v.optional(v.id("users")),
    acceptedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  },
  returns: okResultValidator,
  handler: async (ctx, args) => {
    const invitation = await requireInvitation(ctx, args.invitationId);
    if (invitation.organizationId !== args.organizationId) {
      throw new Error("Organization invitation not found");
    }
    const now = Date.now();
    if (args.acceptedByUserId !== undefined) {
      await requireUser(ctx, args.acceptedByUserId);
    }
    await ctx.db.patch("organization_invitations", invitation._id, {
      status: args.status,
      acceptedByUserId: args.acceptedByUserId ?? invitation.acceptedByUserId,
      acceptedAt:
        args.acceptedAt ?? invitation.acceptedAt ?? (args.status === "accepted" ? now : undefined),
      revokedAt:
        args.revokedAt ?? invitation.revokedAt ?? (args.status === "revoked" ? now : undefined),
      updatedAt: now,
    });
    return okResult();
  },
});

export const revokeInvitation = mutation({
  args: {
    invitationId: v.id("organization_invitations"),
    revokedAt: v.optional(v.number()),
  },
  returns: okResultValidator,
  handler: async (ctx, { invitationId, revokedAt }) => {
    const invitation = await requireInvitation(ctx, invitationId);
    if (invitation.status === "accepted") {
      throw new Error("Accepted organization invitations cannot be revoked");
    }
    const now = Date.now();
    await ctx.db.patch("organization_invitations", invitation._id, {
      status: "revoked",
      revokedAt: revokedAt ?? invitation.revokedAt ?? now,
      updatedAt: now,
    });
    await emitOrganizationEvent(ctx, {
      eventType: "invitation.revoked",
      organizationId: invitation.organizationId,
      data: {
        organizationId: invitation.organizationId,
        invitationId: invitation._id,
      },
    });
    return okResult();
  },
});

export const redeemInvitation = mutation({
  args: {
    invitationId: v.optional(v.id("organization_invitations")),
    tokenHash: v.optional(v.string()),
    acceptedByUserId: v.id("users"),
    acceptedAt: v.optional(v.number()),
    assignedBy: v.optional(v.id("users")),
  },
  returns: redeemInvitationResultValidator,
  handler: async (ctx, args) => {
    const invitation = await requireInvitationForRedemption(ctx, args.invitationId, args.tokenHash);
    await requireUser(ctx, args.acceptedByUserId);
    if (args.assignedBy !== undefined) {
      await requireUser(ctx, args.assignedBy);
    }
    await requireOrganization(ctx, invitation.organizationId);
    await requireRole(ctx, invitation.roleId, invitation.organizationId);

    const now = Date.now();
    const acceptedAt = args.acceptedAt ?? now;
    if (invitation.status === "revoked") {
      throw new Error("Organization invitation is revoked");
    }
    if (invitation.status === "expired" || invitation.expiresAt <= now) {
      throw new Error("Organization invitation is expired");
    }
    if (
      invitation.status === "accepted" &&
      invitation.acceptedByUserId !== undefined &&
      invitation.acceptedByUserId !== args.acceptedByUserId
    ) {
      throw new Error("Organization invitation was accepted by another user");
    }

    const { memberId, activated } = await upsertAcceptedInvitationMember(ctx, {
      invitation,
      acceptedByUserId: args.acceptedByUserId,
      acceptedAt,
      assignedBy: args.assignedBy,
    });
    if (invitation.status !== "accepted") {
      await ctx.db.patch("organization_invitations", invitation._id, {
        status: "accepted",
        acceptedByUserId: args.acceptedByUserId,
        acceptedAt,
        updatedAt: now,
      });
      await emitOrganizationEvent(ctx, {
        eventType: "invitation.accepted",
        organizationId: invitation.organizationId,
        data: {
          organizationId: invitation.organizationId,
          invitationId: invitation._id,
        },
      });
    }
    if (activated) {
      await emitOrganizationEvent(ctx, {
        eventType: "member.added",
        organizationId: invitation.organizationId,
        data: {
          organizationId: invitation.organizationId,
          memberId,
          userId: args.acceptedByUserId,
          roleId: invitation.roleId,
        },
      });
    }

    return {
      invitationId: invitation._id,
      memberId,
      accepted: invitation.status !== "accepted",
    };
  },
});

export const resendInvitation = mutation({
  args: {
    invitationId: v.id("organization_invitations"),
    emailId: v.optional(v.union(v.string(), v.null())),
    emailDeliveryStatus: v.optional(invitationEmailDeliveryStatusValidator),
    emailDeliveryEvent: v.optional(v.union(v.string(), v.null())),
    emailDeliveryError: v.optional(v.union(v.string(), v.null())),
    expiresAt: v.optional(v.number()),
  },
  returns: okResultValidator,
  handler: async (ctx, args) => {
    const invitation = await requireInvitation(ctx, args.invitationId);
    if (invitation.status !== "pending") {
      throw new Error("Only pending organization invitations can be resent");
    }
    const now = Date.now();
    await ctx.db.patch("organization_invitations", invitation._id, {
      emailId: args.emailId === undefined ? invitation.emailId : normalizeOptional(args.emailId),
      emailDeliveryStatus: args.emailDeliveryStatus ?? "queued",
      emailDeliveryEvent:
        args.emailDeliveryEvent === undefined
          ? invitation.emailDeliveryEvent
          : normalizeOptional(args.emailDeliveryEvent),
      emailDeliveryError:
        args.emailDeliveryError === undefined
          ? invitation.emailDeliveryError
          : normalizeOptional(args.emailDeliveryError),
      emailDeliveryUpdatedAt: now,
      expiresAt: args.expiresAt ?? invitation.expiresAt,
      updatedAt: now,
    });
    return okResult();
  },
});

export const recordInvitationEmailDelivery = mutation({
  args: {
    invitationId: v.id("organization_invitations"),
    organizationId: v.id("organizations"),
    emailId: v.optional(v.union(v.string(), v.null())),
    emailDeliveryStatus: invitationEmailDeliveryStatusValidator,
    emailDeliveryEvent: v.optional(v.union(v.string(), v.null())),
    emailDeliveryError: v.optional(v.union(v.string(), v.null())),
  },
  returns: okResultValidator,
  handler: async (ctx, args) => {
    const invitation = await requireInvitation(ctx, args.invitationId);
    if (invitation.organizationId !== args.organizationId) {
      // Cross-organization IDOR guard: an invitation addressed by id alone could
      // belong to another tenant. Refuse unless it lives in the named org.
      throw new Error("Organization invitation not found");
    }
    await ctx.db.patch("organization_invitations", args.invitationId, {
      emailId: normalizeOptional(args.emailId),
      emailDeliveryStatus: args.emailDeliveryStatus,
      emailDeliveryEvent: normalizeOptional(args.emailDeliveryEvent),
      emailDeliveryError: normalizeOptional(args.emailDeliveryError),
      emailDeliveryUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return okResult();
  },
});

async function findOrganizationBySlug(ctx: DbCtx, slug: string) {
  return await getOneFrom(ctx.db, "organizations", "by_slug", slug, "slug");
}

async function findRoleByKey(
  ctx: DbCtx,
  organizationId: Id<"organizations">,
  key: string,
): Promise<Doc<"organization_roles"> | null> {
  const { page } = await getPage(ctx, {
    table: "organization_roles",
    index: "by_organization_key",
    startIndexKey: [organizationId, key],
    endIndexKey: [organizationId, key],
    absoluteMaxRows: 1,
    schema,
  });
  return page[0] ?? null;
}

async function requireRoleById(
  ctx: DbCtx,
  roleId: Id<"organization_roles">,
): Promise<Doc<"organization_roles">> {
  const role = await ctx.db.get("organization_roles", roleId);
  if (role === null) {
    throw new Error("Organization role not found");
  }
  return role;
}

async function findMemberByUserOrganization(
  ctx: DbCtx,
  userId: Id<"users">,
  organizationId: Id<"organizations">,
): Promise<Doc<"organization_members"> | null> {
  const { page } = await getPage(ctx, {
    table: "organization_members",
    index: "by_user_organization",
    startIndexKey: [userId, organizationId],
    endIndexKey: [userId, organizationId],
    absoluteMaxRows: 1,
    schema,
  });
  return page[0] ?? null;
}

async function requireMember(
  ctx: DbCtx,
  memberId: Id<"organization_members">,
): Promise<Doc<"organization_members">> {
  const member = await ctx.db.get("organization_members", memberId);
  if (member === null) {
    throw new Error("Organization member not found");
  }
  return member;
}

async function findInvitedMember(
  ctx: DbCtx,
  organizationId: Id<"organizations">,
  invitedEmail: string,
): Promise<Doc<"organization_members"> | null> {
  const { page } = await getPage(ctx, {
    table: "organization_members",
    index: "by_organization_invited_email",
    startIndexKey: [organizationId, invitedEmail],
    endIndexKey: [organizationId, invitedEmail],
    absoluteMaxRows: 1,
    schema,
  });
  return page[0] ?? null;
}

type UpsertOrganizationMemberArgs = {
  organizationId: Id<"organizations">;
  userId?: Id<"users">;
  roleId: Id<"organization_roles">;
  status?: Doc<"organization_members">["status"];
  invitedEmail?: string | null;
  invitedBy?: Id<"users">;
  assignedBy?: Id<"users">;
  invitedAt?: number;
  acceptedAt?: number;
};

async function upsertOrganizationMemberRecord(
  ctx: MutationCtx,
  args: UpsertOrganizationMemberArgs,
): Promise<{ memberId: Id<"organization_members">; created: boolean }> {
  const now = Date.now();
  const normalizedEmail = normalizeEmail(args.invitedEmail ?? undefined);
  const existing = await findExistingOrganizationMember(ctx, args, normalizedEmail);
  const patch = buildOrganizationMemberPatch(args, existing, normalizedEmail, now);

  if (existing !== null) {
    await ctx.db.patch("organization_members", existing._id, patch);
    await emitMemberRoleChangedIfNeeded(ctx, existing, patch);
    return { memberId: existing._id, created: false };
  }

  const memberId = await ctx.db.insert("organization_members", {
    ...patch,
    createdAt: now,
  });
  await emitOrganizationEvent(ctx, {
    eventType: "member.added",
    organizationId: args.organizationId,
    data: buildMemberWebhookPayload(args.organizationId, memberId, patch),
  });
  return { memberId, created: true };
}

async function findExistingOrganizationMember(
  ctx: DbCtx,
  args: UpsertOrganizationMemberArgs,
  normalizedEmail: string | undefined,
): Promise<Doc<"organization_members"> | null> {
  return (
    (args.userId
      ? await findMemberByUserOrganization(ctx, args.userId, args.organizationId)
      : null) ??
    (normalizedEmail ? await findInvitedMember(ctx, args.organizationId, normalizedEmail) : null)
  );
}

function buildOrganizationMemberPatch(
  args: UpsertOrganizationMemberArgs,
  existing: Doc<"organization_members"> | null,
  normalizedEmail: string | undefined,
  now: number,
) {
  const status = resolveOrganizationMemberStatus(args, existing);
  return {
    organizationId: args.organizationId,
    userId: preferDefined(args.userId, existing?.userId),
    roleId: args.roleId,
    status,
    invitedEmail: normalizedEmail ?? undefined,
    invitedBy: preferDefined(args.invitedBy, existing?.invitedBy),
    assignedBy: preferDefined(args.assignedBy, existing?.assignedBy),
    invitedAt: preferDefined(args.invitedAt, existing?.invitedAt),
    acceptedAt: resolveOrganizationMemberAcceptedAt(args, existing, status, now),
    updatedAt: now,
  };
}

function resolveOrganizationMemberStatus(
  args: UpsertOrganizationMemberArgs,
  existing: Doc<"organization_members"> | null,
) {
  return args.status ?? existing?.status ?? (args.userId ? "active" : "invited");
}

function resolveOrganizationMemberAcceptedAt(
  args: UpsertOrganizationMemberArgs,
  existing: Doc<"organization_members"> | null,
  status: Doc<"organization_members">["status"],
  now: number,
) {
  return args.acceptedAt ?? existing?.acceptedAt ?? (status === "active" ? now : undefined);
}

async function emitMemberRoleChangedIfNeeded(
  ctx: MutationCtx,
  existing: Doc<"organization_members">,
  patch: ReturnType<typeof buildOrganizationMemberPatch>,
): Promise<void> {
  if (existing.roleId === patch.roleId) {
    return;
  }

  await emitOrganizationEvent(ctx, {
    eventType: "member.role_changed",
    organizationId: existing.organizationId,
    data: buildMemberWebhookPayload(existing.organizationId, existing._id, patch),
  });
}

function buildMemberWebhookPayload(
  organizationId: Id<"organizations">,
  memberId: Id<"organization_members">,
  member: Pick<Doc<"organization_members">, "roleId" | "status" | "userId">,
) {
  return {
    organizationId,
    memberId,
    userId: member.userId,
    roleId: member.roleId,
    status: member.status,
  };
}

async function requireInvitation(
  ctx: DbCtx,
  invitationId: Id<"organization_invitations">,
): Promise<Doc<"organization_invitations">> {
  const invitation = await ctx.db.get("organization_invitations", invitationId);
  if (invitation === null) {
    throw new Error("Organization invitation not found");
  }
  return invitation;
}

async function requireInvitationForRedemption(
  ctx: DbCtx,
  invitationId: Id<"organization_invitations"> | undefined,
  tokenHash: string | undefined,
): Promise<Doc<"organization_invitations">> {
  const invitation =
    invitationId === undefined ? null : await ctx.db.get("organization_invitations", invitationId);
  const normalizedTokenHash =
    tokenHash === undefined ? undefined : normalizeRequired(tokenHash, "tokenHash");
  const foundByToken =
    normalizedTokenHash === undefined
      ? null
      : await findInvitationByTokenHash(ctx, normalizedTokenHash);
  const resolved = invitation ?? foundByToken;

  if (resolved === null) {
    throw new Error("Organization invitation not found");
  }
  if (normalizedTokenHash !== undefined && resolved.tokenHash !== normalizedTokenHash) {
    throw new Error("Organization invitation token mismatch");
  }
  return resolved;
}

async function upsertAcceptedInvitationMember(
  ctx: MutationCtx,
  {
    invitation,
    acceptedByUserId,
    acceptedAt,
    assignedBy,
  }: {
    invitation: Doc<"organization_invitations">;
    acceptedByUserId: Id<"users">;
    acceptedAt: number;
    assignedBy: Id<"users"> | undefined;
  },
): Promise<{ memberId: Id<"organization_members">; activated: boolean }> {
  const now = Date.now();
  const existing = await findMemberByUserOrganization(
    ctx,
    acceptedByUserId,
    invitation.organizationId,
  );
  const patch = {
    organizationId: invitation.organizationId,
    userId: acceptedByUserId,
    roleId: invitation.roleId,
    status: "active" as const,
    invitedEmail: invitation.email,
    invitedBy: invitation.invitedBy,
    assignedBy: assignedBy ?? invitation.invitedBy,
    invitedAt: invitation.createdAt,
    acceptedAt: existing?.acceptedAt ?? acceptedAt,
    updatedAt: now,
  };

  if (existing !== null) {
    await ctx.db.patch("organization_members", existing._id, patch);
    return { memberId: existing._id, activated: existing.status !== "active" };
  }

  const memberId = await ctx.db.insert("organization_members", {
    ...patch,
    createdAt: now,
  });
  return { memberId, activated: true };
}

type UpsertOrganizationInvitationArgs = {
  invitationId?: Id<"organization_invitations">;
  organizationId: Id<"organizations">;
  roleId: Id<"organization_roles">;
  email: string;
  tokenHash: string;
  status?: Doc<"organization_invitations">["status"];
  invitedBy: Id<"users">;
  expiresAt: number;
  acceptedByUserId?: Id<"users">;
  acceptedAt?: number;
  revokedAt?: number;
  emailId?: string | null;
  emailDeliveryStatus?: Doc<"organization_invitations">["emailDeliveryStatus"];
  emailDeliveryEvent?: string | null;
  emailDeliveryError?: string | null;
  emailDeliveryUpdatedAt?: number;
  metadataJson?: string | null;
};

async function upsertOrganizationInvitationRecord(
  ctx: MutationCtx,
  args: UpsertOrganizationInvitationArgs,
): Promise<{ invitationId: Id<"organization_invitations">; created: boolean }> {
  const now = Date.now();
  const email = normalizeRequiredEmail(args.email);
  const existing = await findExistingOrganizationInvitation(ctx, args);
  const patch = buildOrganizationInvitationPatch(args, existing, email, now);

  if (existing !== null) {
    await ctx.db.patch("organization_invitations", existing._id, patch);
    return { invitationId: existing._id, created: false };
  }

  const invitationId = await ctx.db.insert("organization_invitations", {
    ...patch,
    createdAt: now,
  });
  await emitOrganizationEvent(ctx, {
    eventType: "invitation.created",
    organizationId: args.organizationId,
    data: { organizationId: args.organizationId, invitationId, email },
  });
  return { invitationId, created: true };
}

async function findExistingOrganizationInvitation(
  ctx: DbCtx,
  args: UpsertOrganizationInvitationArgs,
): Promise<Doc<"organization_invitations"> | null> {
  return (
    (args.invitationId ? await ctx.db.get("organization_invitations", args.invitationId) : null) ??
    (await findInvitationByTokenHash(ctx, args.tokenHash))
  );
}

function buildOrganizationInvitationPatch(
  args: UpsertOrganizationInvitationArgs,
  existing: Doc<"organization_invitations"> | null,
  email: string,
  now: number,
) {
  return {
    organizationId: args.organizationId,
    roleId: args.roleId,
    email,
    tokenHash: args.tokenHash,
    status: args.status ?? existing?.status ?? "pending",
    invitedBy: args.invitedBy,
    expiresAt: args.expiresAt,
    acceptedByUserId: preferDefined(args.acceptedByUserId, existing?.acceptedByUserId),
    acceptedAt: preferDefined(args.acceptedAt, existing?.acceptedAt),
    revokedAt: preferDefined(args.revokedAt, existing?.revokedAt),
    emailId: args.emailId ?? undefined,
    emailDeliveryStatus: preferDefined(args.emailDeliveryStatus, existing?.emailDeliveryStatus),
    emailDeliveryEvent: args.emailDeliveryEvent ?? undefined,
    emailDeliveryError: args.emailDeliveryError ?? undefined,
    emailDeliveryUpdatedAt: preferDefined(
      args.emailDeliveryUpdatedAt,
      existing?.emailDeliveryUpdatedAt,
    ),
    metadataJson: args.metadataJson ?? undefined,
    updatedAt: now,
  };
}

function preferDefined<T>(value: T | undefined, fallback: T | undefined): T | undefined {
  return value ?? fallback;
}

async function findInvitationByTokenHash(
  ctx: DbCtx,
  tokenHash: string,
): Promise<Doc<"organization_invitations"> | null> {
  return await getOneFrom(
    ctx.db,
    "organization_invitations",
    "by_token_hash",
    tokenHash,
    "tokenHash",
  );
}

async function requireOrganization(
  ctx: DbCtx,
  organizationId: Id<"organizations">,
): Promise<Doc<"organizations">> {
  const organization = await ctx.db.get("organizations", organizationId);
  if (organization === null) {
    throw new Error("Organization not found");
  }
  return organization;
}

async function requireRole(
  ctx: DbCtx,
  roleId: Id<"organization_roles">,
  organizationId: Id<"organizations">,
) {
  const role = await ctx.db.get("organization_roles", roleId);
  if (role === null || role.organizationId !== organizationId) {
    throw new Error("Organization role not found");
  }
}

async function requireUser(ctx: DbCtx, userId: Id<"users">): Promise<Doc<"users">> {
  const user = await ctx.db.get("users", userId);
  if (user === null) {
    throw new Error("User not found");
  }
  return user;
}

function normalizeRequired(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

function normalizeRequiredEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (normalized === undefined) {
    throw new Error("email is required");
  }
  return normalized;
}

function normalizeOptional(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function normalizeEmail(email: string | undefined): string | undefined {
  const normalized = email?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function resolveListLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 100;
  }
  if (!Number.isFinite(limit)) {
    return 100;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 500);
}
