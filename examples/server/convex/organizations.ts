import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";
import { defaultOrganizationRoleCatalog } from "@vortex-api/convex-auth/convex";
import { requireCaller } from "./authz";

import type { MutationCtx, QueryCtx } from "./_generated/server";

type Ctx = QueryCtx | MutationCtx;

type OrgMember = {
  _id: string;
  organizationId: string;
  userId?: string;
  roleId: string;
  status: "active" | "invited" | "suspended";
  invitedEmail?: string;
};

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/* Permission check mirrors the catalog contract: `*` = all, `domain:*` =
 * everything within a domain, otherwise exact `domain:subdomain:action`. */
function permissionGranted(permissions: readonly string[], needed: string): boolean {
  if (permissions.includes("*") || permissions.includes(needed)) return true;
  const domain = needed.split(":")[0];
  return domain !== undefined && permissions.includes(`${domain}:*`);
}

async function callerMembership(
  ctx: Ctx,
  organizationId: string,
  userId: string,
): Promise<OrgMember | null> {
  const member = await ctx.runQuery(
    components.convexAuth.organizations.getMemberByUserOrganization,
    { organizationId, userId },
  );
  if (member === null || member.status !== "active") {
    return null;
  }
  return member as OrgMember;
}

/* Read gate: caller must be an active member of the org. */
async function requireOrgMember(
  ctx: Ctx,
  organizationId: string,
  userId: string,
): Promise<OrgMember> {
  const member = await callerMembership(ctx, organizationId, userId);
  if (member === null) {
    throw new Error("Not a member of this organization");
  }
  return member;
}

/* Write gate: caller's role must carry the permission. Membership alone is
 * not enough — this is what keeps "member" from promoting itself or minting
 * org credentials. */
async function requireOrgPermission(
  ctx: Ctx,
  organizationId: string,
  userId: string,
  permission: string,
): Promise<OrgMember> {
  const member = await requireOrgMember(ctx, organizationId, userId);
  const role = await ctx.runQuery(components.convexAuth.organizations.getRole, {
    organizationId,
    roleId: member.roleId,
  });
  if (role === null || !permissionGranted(role.permissions, permission)) {
    throw new Error("Missing permission");
  }
  return member;
}

/* Read-only role resolution — never ensureRole on a lookup path; it would
 * rewrite the seeded catalog's permissions with guessed values. */
async function roleIdFor(ctx: Ctx, organizationId: string, key: string): Promise<string> {
  const role = await ctx.runQuery(components.convexAuth.organizations.getRoleByKey, {
    organizationId,
    key,
  });
  if (role === null) {
    throw new Error(`Role not found: ${key}`);
  }
  return role._id;
}

export const createOrganization = mutation({
  args: { name: v.string(), slug: v.string() },
  returns: v.object({ organizationId: v.string() }),
  handler: async (ctx, args) => {
    const callerId = await requireCaller(ctx);
    const { organizationId } = await ctx.runMutation(
      components.convexAuth.organizations.upsertOrganization,
      { name: args.name, slug: args.slug, createdBy: callerId },
    );
    /* The component's built-in seed is owner+member only — pass the runtime's
     * full catalog (owner/admin/manager/member/viewer) explicitly so admin
     * and intermediate roles exist and carry the canonical permissions. */
    await ctx.runMutation(components.convexAuth.organizations.seedDefaultRoles, {
      organizationId,
      catalog: defaultOrganizationRoleCatalog().map((r) => ({
        key: r.key,
        name: r.name,
        description: r.description,
        permissions: [...r.permissions],
        isSystem: r.isSystem,
      })),
    });
    const ownerRoleId = await roleIdFor(ctx, organizationId, "owner");
    await ctx.runMutation(components.convexAuth.organizations.upsertMember, {
      organizationId,
      userId: callerId,
      roleId: ownerRoleId,
      status: "active",
      acceptedAt: Date.now(),
    });
    return { organizationId };
  },
});

/* Issues an invitation and returns the plaintext token to the caller — a real
 * app emails it; the fixture hands it back so the driver can redeem. */
export const inviteMember = mutation({
  args: {
    organizationId: v.string(),
    email: v.string(),
    roleKey: v.optional(v.string()),
  },
  returns: v.object({ invitationId: v.string(), token: v.string() }),
  handler: async (ctx, args) => {
    const callerId = await requireCaller(ctx);
    await requireOrgPermission(
      ctx,
      args.organizationId,
      callerId,
      "organization:invitations:manage",
    );
    const roleId = await roleIdFor(ctx, args.organizationId, args.roleKey ?? "member");
    const token = generateToken();
    const { invitationId } = await ctx.runMutation(
      components.convexAuth.organizations.upsertInvitation,
      {
        organizationId: args.organizationId,
        email: args.email,
        roleId,
        invitedBy: callerId,
        tokenHash: await sha256Hex(token),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      },
    );
    return { invitationId, token };
  },
});

export const acceptInvitation = mutation({
  args: { token: v.string() },
  returns: v.object({ accepted: v.boolean(), memberId: v.string() }),
  handler: async (ctx, args) => {
    const callerId = await requireCaller(ctx);
    const result = await ctx.runMutation(components.convexAuth.organizations.redeemInvitation, {
      tokenHash: await sha256Hex(args.token),
      acceptedByUserId: callerId,
      acceptedAt: Date.now(),
    });
    return { accepted: result.accepted, memberId: result.memberId };
  },
});

export const listMembers = query({
  args: { organizationId: v.string() },
  returns: v.array(
    v.object({
      _id: v.string(),
      userId: v.optional(v.string()),
      roleId: v.string(),
      status: v.string(),
      invitedEmail: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const callerId = await requireCaller(ctx);
    await requireOrgPermission(ctx, args.organizationId, callerId, "organization:members:read");
    const members = await ctx.runQuery(
      components.convexAuth.organizations.listMembersByOrganization,
      { organizationId: args.organizationId },
    );
    return members.map((m: OrgMember) => ({
      _id: m._id,
      userId: m.userId,
      roleId: m.roleId,
      status: m.status,
      invitedEmail: m.invitedEmail,
    }));
  },
});

export const setMemberRole = mutation({
  args: {
    organizationId: v.string(),
    memberId: v.string(),
    roleKey: v.string(),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const callerId = await requireCaller(ctx);
    await requireOrgPermission(ctx, args.organizationId, callerId, "organization:members:manage");
    const roleId = await roleIdFor(ctx, args.organizationId, args.roleKey);
    await ctx.runMutation(components.convexAuth.organizations.setMemberRole, {
      organizationId: args.organizationId,
      memberId: args.memberId,
      roleId,
      assignedBy: callerId,
    });
    return { ok: true as const };
  },
});

/* API keys act with the org's authority — only owners (the seeded catalog's
 * `*`) may mint or revoke them. Not part of the default admin bundle. */
const API_KEYS_MANAGE = "organization:api-keys:manage";

export const issueOrgApiKey = mutation({
  args: {
    organizationId: v.string(),
    name: v.string(),
    scopes: v.optional(v.array(v.string())),
  },
  returns: v.object({
    apiKey: v.string(),
    apiKeyId: v.string(),
    keyPrefix: v.string(),
  }),
  handler: async (ctx, args) => {
    const callerId = await requireCaller(ctx);
    await requireOrgPermission(ctx, args.organizationId, callerId, API_KEYS_MANAGE);
    const result = await ctx.runMutation(components.convexAuth.apiKeys.issueApiKey, {
      organizationId: args.organizationId,
      name: args.name,
      environment: "sandbox",
      userId: callerId,
      scopes: args.scopes,
    });
    return {
      apiKey: result.apiKey,
      apiKeyId: result.apiKeyId,
      keyPrefix: result.keyPrefix,
    };
  },
});

/* API-key verification. A real API verifies the presented key instead of a
 * user session; the fixture still requires authentication, and the verdict's
 * org binding is only revealed to members of that org — outsiders get the
 * same not_found as a garbage key so the endpoint cannot probe across
 * tenants. */
export const verifyApiKey = mutation({
  args: {
    presentedKey: v.string(),
    requiredScopes: v.optional(v.array(v.string())),
  },
  returns: v.object({
    valid: v.boolean(),
    reason: v.optional(v.string()),
    organizationId: v.optional(v.string()),
    scopes: v.optional(v.array(v.string())),
  }),
  handler: async (ctx, args) => {
    const callerId = await requireCaller(ctx);
    const verdict = await ctx.runMutation(components.convexAuth.apiKeys.verifyApiKey, {
      presentedKey: args.presentedKey,
      requiredScopes: args.requiredScopes,
      environment: "sandbox",
    });
    if (verdict.valid !== true) {
      return { valid: false, reason: verdict.reason };
    }
    if (verdict.organizationId === undefined) {
      return { valid: false, reason: "not_found" };
    }
    const membership = await callerMembership(ctx, verdict.organizationId, callerId);
    if (membership === null) {
      return { valid: false, reason: "not_found" };
    }
    return {
      valid: true,
      organizationId: verdict.organizationId,
      scopes: verdict.scopes,
    };
  },
});

export const revokeApiKey = mutation({
  args: { organizationId: v.string(), apiKeyId: v.string() },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const callerId = await requireCaller(ctx);
    await requireOrgPermission(ctx, args.organizationId, callerId, API_KEYS_MANAGE);
    await ctx.runMutation(components.convexAuth.apiKeys.revokeApiKey, {
      organizationId: args.organizationId,
      apiKeyId: args.apiKeyId,
    });
    return { ok: true as const };
  },
});

export const listApiKeys = query({
  args: { organizationId: v.string() },
  returns: v.array(
    v.object({
      _id: v.string(),
      name: v.string(),
      keyPrefix: v.string(),
      status: v.string(),
      scopes: v.array(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const callerId = await requireCaller(ctx);
    await requireOrgPermission(ctx, args.organizationId, callerId, API_KEYS_MANAGE);
    const keys = await ctx.runQuery(components.convexAuth.apiKeys.listApiKeysByOrganization, {
      organizationId: args.organizationId,
    });
    return keys.map(
      (k: { _id: string; name: string; keyPrefix: string; status: string; scopes: string[] }) => ({
        _id: k._id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        status: k.status,
        scopes: k.scopes,
      }),
    );
  },
});
