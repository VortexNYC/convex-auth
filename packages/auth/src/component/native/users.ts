import type { GenericMutationCtx, TableNamesInDataModel } from "convex/server";
import { v } from "convex/values";
import { getOneFrom } from "convex-helpers/server/relationships";
import { mutation, query } from "../_generated/server.js";
import type { DataModel, Doc, Id } from "../_generated/dataModel.js";

export const getUserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await getOneFrom(ctx.db, "users", "by_email", args.email.toLowerCase().trim());
  },
});

export const getUserById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get("users", args.userId);
  },
});

export const markEmailVerified = mutation({
  args: {
    userId: v.id("users"),
    emailVerified: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.userId, {
      emailVerified: args.emailVerified,
      updatedAt: now,
    });
  },
});

export const setTwoFactor = mutation({
  args: {
    userId: v.id("users"),
    twoFactorEnabled: v.boolean(),
    twoFactorSecret: v.optional(v.string()),
    twoFactorBackupCodes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const patch: {
      twoFactorEnabled: boolean;
      twoFactorSecret?: string;
      twoFactorBackupCodes?: string[];
      updatedAt: number;
    } = {
      twoFactorEnabled: args.twoFactorEnabled,
      twoFactorSecret: args.twoFactorSecret,
      twoFactorBackupCodes: args.twoFactorBackupCodes,
      updatedAt: now,
    };
    if (args.twoFactorSecret === undefined) {
      patch.twoFactorSecret = undefined;
    }
    if (args.twoFactorBackupCodes === undefined) {
      patch.twoFactorBackupCodes = undefined;
    }
    await ctx.db.patch(args.userId, patch);
  },
});

export const updateUser = mutation({
  args: {
    userId: v.id("users"),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    metadataJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const patch: {
      name?: string;
      image?: string;
      metadataJson?: string;
      updatedAt: number;
    } = { updatedAt: now };
    if (args.name !== undefined) patch.name = args.name;
    if (args.image !== undefined) patch.image = args.image;
    if (args.metadataJson !== undefined) patch.metadataJson = args.metadataJson;
    await ctx.db.patch(args.userId, patch);
  },
});

export const consumeBackupCode = mutation({
  args: {
    userId: v.id("users"),
    backupCodeHash: v.string(),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user) {
      return { success: false };
    }
    const codes = user.twoFactorBackupCodes ?? [];
    const index = codes.indexOf(args.backupCodeHash);
    if (index < 0) {
      return { success: false };
    }
    const next = codes.slice();
    next.splice(index, 1);
    await ctx.db.patch(args.userId, {
      twoFactorBackupCodes: next,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

type Ctx = GenericMutationCtx<DataModel>;
type AnyTableName = TableNamesInDataModel<DataModel>;
type AnyId = Id<AnyTableName>;

type DeletionState = {
  deletedIds: Set<string>;
};

function newDeletionState(): DeletionState {
  return { deletedIds: new Set<string>() };
}

async function deleteDocument(ctx: Ctx, state: DeletionState, id: AnyId) {
  const key = String(id);
  if (state.deletedIds.has(key)) {
    return;
  }
  await ctx.db.delete(id);
  state.deletedIds.add(key);
}

export const deleteUser = mutation({
  args: { userId: v.id("users") },
  returns: v.object({ deleted: v.boolean(), userId: v.id("users") }),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get("users", userId);
    if (!user) {
      return { deleted: false, userId };
    }

    const state = newDeletionState();

    for await (const identity of ctx.db
      .query("auth_identities")
      .withIndex("by_user", (q) => q.eq("userId", userId))) {
      await deleteDocument(ctx, state, identity._id);
    }

    for await (const account of ctx.db
      .query("authAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))) {
      await deleteDocument(ctx, state, account._id);
    }

    for await (const session of ctx.db
      .query("authSessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))) {
      await deleteDocument(ctx, state, session._id);
    }

    for await (const token of ctx.db
      .query("authRefreshTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))) {
      await deleteDocument(ctx, state, token._id);
    }

    for await (const code of ctx.db
      .query("authVerificationCodes")
      .withIndex("by_user_type", (q) => q.eq("userId", userId))) {
      await deleteDocument(ctx, state, code._id);
    }

    // We need to hold the user's memberships in memory once because
    // deleteOrganization will delete some of them before we walk the list.
    const memberships: Doc<"organization_members">[] = [];
    for await (const membership of ctx.db
      .query("organization_members")
      .withIndex("by_user", (q) => q.eq("userId", userId))) {
      memberships.push(membership);
    }

    for (const membership of memberships) {
      if (!membership.organizationId) continue;
      let orgMemberCount = 0;
      for await (const _ of ctx.db
        .query("organization_members")
        .withIndex("by_organization", (q) => q.eq("organizationId", membership.organizationId))) {
        orgMemberCount++;
        if (orgMemberCount > 1) break;
      }
      if (orgMemberCount <= 1) {
        await deleteOrganization(ctx, state, membership.organizationId);
      }
      await deleteDocument(ctx, state, membership._id);
    }

    for await (const key of ctx.db
      .query("api_keys")
      .withIndex("by_user", (q) => q.eq("userId", userId))) {
      await deleteDocument(ctx, state, key._id);
    }

    for await (const sp of ctx.db
      .query("service_principals")
      .withIndex("by_createdBy", (q) => q.eq("createdBy", userId))) {
      await deleteServicePrincipal(ctx, state, sp._id);
    }

    for await (const endpoint of ctx.db
      .query("webhook_endpoints")
      .withIndex("by_createdBy", (q) => q.eq("createdBy", userId))) {
      await deleteWebhookEndpoint(ctx, state, endpoint._id);
    }

    for await (const reg of ctx.db
      .query("auth_md_registrations")
      .withIndex("by_user_status", (q) => q.eq("claimedByUserId", userId))) {
      await deleteDocument(ctx, state, reg._id);
    }

    for await (const cred of ctx.db
      .query("auth_md_credentials")
      .withIndex("by_user_organization", (q) => q.eq("userId", userId))) {
      await deleteDocument(ctx, state, cred._id);
    }

    await deleteDocument(ctx, state, userId);
    return { deleted: true, userId };
  },
});

async function deleteOrganization(
  ctx: Ctx,
  state: DeletionState,
  organizationId: Id<"organizations">,
) {
  const organization = await ctx.db.get("organizations", organizationId);
  if (organization === null) {
    return;
  }

  for await (const role of ctx.db
    .query("organization_roles")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))) {
    await deleteDocument(ctx, state, role._id);
  }

  for await (const member of ctx.db
    .query("organization_members")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))) {
    await deleteDocument(ctx, state, member._id);
  }

  for await (const invitation of ctx.db
    .query("organization_invitations")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))) {
    await deleteDocument(ctx, state, invitation._id);
  }

  for await (const key of ctx.db
    .query("api_keys")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))) {
    await deleteDocument(ctx, state, key._id);
  }

  for await (const sp of ctx.db
    .query("service_principals")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))) {
    await deleteServicePrincipal(ctx, state, sp._id);
  }

  for await (const endpoint of ctx.db
    .query("webhook_endpoints")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))) {
    await deleteWebhookEndpoint(ctx, state, endpoint._id);
  }

  for await (const reg of ctx.db
    .query("auth_md_registrations")
    .withIndex("by_organization_status", (q) => q.eq("organizationId", organizationId))) {
    await deleteDocument(ctx, state, reg._id);
  }

  for await (const event of ctx.db
    .query("auth_audit_events")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))) {
    await deleteDocument(ctx, state, event._id);
  }

  await deleteDocument(ctx, state, organizationId);
}

async function deleteServicePrincipal(
  ctx: Ctx,
  state: DeletionState,
  servicePrincipalId: Id<"service_principals">,
) {
  for await (const key of ctx.db
    .query("api_keys")
    .withIndex("by_owner_service", (q) => q.eq("ownerServicePrincipalId", servicePrincipalId))) {
    await deleteDocument(ctx, state, key._id);
  }
  await deleteDocument(ctx, state, servicePrincipalId);
}

async function deleteWebhookEndpoint(
  ctx: Ctx,
  state: DeletionState,
  endpointId: Id<"webhook_endpoints">,
) {
  for await (const delivery of ctx.db
    .query("webhook_deliveries")
    .withIndex("by_endpoint", (q) => q.eq("endpointId", endpointId))) {
    await deleteDocument(ctx, state, delivery._id);
  }
  await deleteDocument(ctx, state, endpointId);
}
