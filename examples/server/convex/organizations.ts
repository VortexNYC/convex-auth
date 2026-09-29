import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";
import { requireCaller } from "./authz";

import type { MutationCtx, QueryCtx } from "./_generated/server";

type Ctx = QueryCtx | MutationCtx;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/* Caller must be an active member of the org for every org-scoped write/read —
 * the component enforces data scoping, the fixture enforces tenancy. */
async function requireOrgMember(ctx: Ctx, organizationId: string, userId: string): Promise<void> {
  const members = await ctx.runQuery(
    components.convexAuth.organizations.listMembersByOrganization,
    { organizationId, status: "active" },
  );
  const caller = members.find((m: { userId?: string }) => m.userId === userId);
  if (caller === undefined) {
    throw new Error("Not a member of this organization");
  }
}

/* resolve a role id by key, creating the catalog entry if it does not exist */
async function roleIdFor(ctx: MutationCtx, organizationId: string, key: string): Promise<string> {
  const { roleId } = await ctx.runMutation(components.convexAuth.organizations.ensureRole, {
    organizationId,
    key,
    name: key.charAt(0).toUpperCase() + key.slice(1),
    permissions: key === "owner" ? ["*"] : ["organization:read"],
  });
  return roleId;
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
    await ctx.runMutation(components.convexAuth.organizations.seedDefaultRoles, {
      organizationId,
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
    await requireOrgMember(ctx, args.organizationId, callerId);
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
    await requireOrgMember(ctx, args.organizationId, callerId);
    const members = await ctx.runQuery(
      components.convexAuth.organizations.listMembersByOrganization,
      { organizationId: args.organizationId },
    );
    return members.map(
      (m: {
        _id: string;
        userId?: string;
        roleId: string;
        status: string;
        invitedEmail?: string;
      }) => ({
        _id: m._id,
        userId: m.userId,
        roleId: m.roleId,
        status: m.status,
        invitedEmail: m.invitedEmail,
      }),
    );
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
    await requireOrgMember(ctx, args.organizationId, callerId);
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
    await requireOrgMember(ctx, args.organizationId, callerId);
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
 * user session; the fixture still requires the caller to be authenticated so
 * the public deployment cannot use it as an anonymous oracle. */
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
    await requireCaller(ctx);
    const verdict = await ctx.runMutation(components.convexAuth.apiKeys.verifyApiKey, {
      presentedKey: args.presentedKey,
      requiredScopes: args.requiredScopes,
      environment: "sandbox",
    });
    if (verdict.valid !== true) {
      return { valid: false, reason: verdict.reason };
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
    await requireOrgMember(ctx, args.organizationId, callerId);
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
    await requireOrgMember(ctx, args.organizationId, callerId);
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
