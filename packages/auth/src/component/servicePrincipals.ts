import { v } from "convex/values";
import { getPage } from "convex-helpers/server/pagination";

import type { Doc, Id } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { mutation, query } from "./_generated/server.js";
import schema, { servicePrincipalStatusValidator } from "./schema.js";

type DbCtx = Pick<MutationCtx | QueryCtx, "db">;

const servicePrincipalResultValidator = v.object({
  servicePrincipalId: v.id("service_principals"),
  created: v.boolean(),
});

const servicePrincipalDocValidator = v.object({
  _id: v.id("service_principals"),
  _creationTime: v.number(),
  key: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  status: servicePrincipalStatusValidator,
  organizationId: v.optional(v.id("organizations")),
  permissions: v.array(v.string()),
  metadataJson: v.optional(v.string()),
  createdBy: v.optional(v.id("users")),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const okResultValidator = v.object({ ok: v.literal(true) });

function okResult() {
  return { ok: true } as const;
}

function servicePrincipalPatch(args: {
  createdBy?: Id<"users">;
  description?: string | null;
  existing: Doc<"service_principals"> | null;
  key: string;
  metadataJson?: string | null;
  name: string;
  organizationId?: Id<"organizations"> | null;
  permissions: string[];
  status?: Doc<"service_principals">["status"];
  updatedAt: number;
}) {
  return {
    key: args.key,
    name: args.name,
    description:
      args.description === undefined
        ? args.existing?.description
        : normalizeOptional(args.description),
    status: args.status ?? args.existing?.status ?? "active",
    organizationId:
      args.organizationId === undefined
        ? args.existing?.organizationId
        : args.organizationId === null
          ? undefined
          : args.organizationId,
    permissions: normalizeStringArray(args.permissions),
    metadataJson:
      args.metadataJson === undefined
        ? args.existing?.metadataJson
        : normalizeOptional(args.metadataJson),
    createdBy: args.createdBy ?? args.existing?.createdBy,
    updatedAt: args.updatedAt,
  };
}

export const upsertServicePrincipal = mutation({
  args: {
    servicePrincipalId: v.optional(v.id("service_principals")),
    key: v.string(),
    name: v.string(),
    description: v.optional(v.union(v.string(), v.null())),
    status: v.optional(servicePrincipalStatusValidator),
    organizationId: v.optional(v.union(v.id("organizations"), v.null())),
    permissions: v.array(v.string()),
    metadataJson: v.optional(v.union(v.string(), v.null())),
    createdBy: v.optional(v.id("users")),
  },
  returns: servicePrincipalResultValidator,
  handler: async (ctx, args) => {
    if (args.organizationId !== undefined && args.organizationId !== null) {
      await requireOrganization(ctx, args.organizationId);
    }
    if (args.createdBy !== undefined) {
      await requireUser(ctx, args.createdBy);
    }

    const now = Date.now();
    const key = normalizeRequired(args.key, "key");
    const name = normalizeRequired(args.name, "name");
    const existing =
      (args.servicePrincipalId
        ? await ctx.db.get("service_principals", args.servicePrincipalId)
        : null) ?? (await findServicePrincipalByKey(ctx, key));
    const keyOwner = await findServicePrincipalByKey(ctx, key);
    if (keyOwner !== null && existing !== null && keyOwner._id !== existing._id) {
      throw new Error("Service principal key already exists");
    }
    const patch = servicePrincipalPatch({
      ...args,
      existing,
      key,
      name,
      updatedAt: now,
    });

    if (existing !== null) {
      await ctx.db.patch("service_principals", existing._id, patch);
      return { servicePrincipalId: existing._id, created: false };
    }

    const servicePrincipalId = await ctx.db.insert("service_principals", {
      ...patch,
      createdAt: now,
    });
    return { servicePrincipalId, created: true };
  },
});

export const getServicePrincipal = query({
  args: {
    servicePrincipalId: v.id("service_principals"),
  },
  returns: v.union(v.null(), servicePrincipalDocValidator),
  handler: async (ctx, { servicePrincipalId }) => {
    return await ctx.db.get("service_principals", servicePrincipalId);
  },
});

export const getServicePrincipalByKey = query({
  args: {
    key: v.string(),
  },
  returns: v.union(v.null(), servicePrincipalDocValidator),
  handler: async (ctx, { key }) => {
    return await findServicePrincipalByKey(ctx, normalizeRequired(key, "key"));
  },
});

export const listServicePrincipals = query({
  args: {
    organizationId: v.optional(v.id("organizations")),
    status: v.optional(servicePrincipalStatusValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(servicePrincipalDocValidator),
  handler: async (ctx, { organizationId, status, limit }) => {
    const resolvedLimit = resolveListLimit(limit);
    if (organizationId === undefined && status !== undefined) {
      const { page } = await getPage(ctx, {
        table: "service_principals",
        index: "by_status",
        startIndexKey: [status],
        endIndexKey: [status],
        absoluteMaxRows: resolvedLimit,
        schema,
      });
      return page;
    }

    if (organizationId === undefined) {
      const { page } = await getPage(ctx, {
        table: "service_principals",
        absoluteMaxRows: resolvedLimit,
      });
      return page;
    }

    const index = status === undefined ? "by_organization" : "by_organization_status";
    const startIndexKey = status === undefined ? [organizationId] : [organizationId, status];
    const { page } = await getPage(ctx, {
      table: "service_principals",
      index,
      startIndexKey,
      endIndexKey: startIndexKey,
      absoluteMaxRows: resolvedLimit,
      schema,
    });
    return page;
  },
});

/**
 * `actingOrganizationId` is the org the CALLER is acting in — the principal
 * must already belong to it, else this is a cross-org IDOR (escalate another
 * tenant's API-key scope via `permissions`). It is distinct from
 * `organizationId`, which is the value to SET.
 */
export const setServicePrincipalDetails = mutation({
  args: {
    servicePrincipalId: v.id("service_principals"),
    actingOrganizationId: v.id("organizations"),
    name: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    organizationId: v.optional(v.union(v.id("organizations"), v.null())),
    permissions: v.optional(v.array(v.string())),
    metadataJson: v.optional(v.union(v.string(), v.null())),
  },
  returns: okResultValidator,
  handler: async (ctx, args) => {
    const servicePrincipal = await requireServicePrincipalInOrganization(
      ctx,
      args.servicePrincipalId,
      args.actingOrganizationId,
    );
    if (args.organizationId !== undefined && args.organizationId !== null) {
      await requireOrganization(ctx, args.organizationId);
    }

    await ctx.db.patch("service_principals", servicePrincipal._id, {
      name: args.name === undefined ? servicePrincipal.name : normalizeRequired(args.name, "name"),
      description:
        args.description === undefined
          ? servicePrincipal.description
          : normalizeOptional(args.description),
      organizationId:
        args.organizationId === undefined
          ? servicePrincipal.organizationId
          : args.organizationId === null
            ? undefined
            : args.organizationId,
      permissions:
        args.permissions === undefined
          ? servicePrincipal.permissions
          : normalizeStringArray(args.permissions),
      metadataJson:
        args.metadataJson === undefined
          ? servicePrincipal.metadataJson
          : normalizeOptional(args.metadataJson),
      updatedAt: Date.now(),
    });
    return okResult();
  },
});

export const setServicePrincipalStatus = mutation({
  args: {
    servicePrincipalId: v.id("service_principals"),
    actingOrganizationId: v.id("organizations"),
    status: servicePrincipalStatusValidator,
  },
  returns: okResultValidator,
  handler: async (ctx, { servicePrincipalId, actingOrganizationId, status }) => {
    await requireServicePrincipalInOrganization(ctx, servicePrincipalId, actingOrganizationId);
    await ctx.db.patch("service_principals", servicePrincipalId, {
      status,
      updatedAt: Date.now(),
    });
    return okResult();
  },
});

async function findServicePrincipalByKey(
  ctx: DbCtx,
  key: string,
): Promise<Doc<"service_principals"> | null> {
  const { page } = await getPage(ctx, {
    table: "service_principals",
    index: "by_key",
    startIndexKey: [key],
    endIndexKey: [key],
    absoluteMaxRows: 1,
    schema,
  });
  return page[0] ?? null;
}

async function requireServicePrincipal(
  ctx: DbCtx,
  servicePrincipalId: Id<"service_principals">,
): Promise<Doc<"service_principals">> {
  const servicePrincipal = await ctx.db.get("service_principals", servicePrincipalId);
  if (servicePrincipal === null) {
    throw new Error("Service principal not found");
  }
  return servicePrincipal;
}

/**
 * Existence + tenant-ownership guard for id-addressed service-principal
 * mutations. Without it, a caller acting in org A could modify org B's service
 * principal (escalate its API-key `permissions`, or disable it). Fails closed —
 * a platform (org-less) principal never matches a real org id, so it is not
 * mutable through these org-scoped ops.
 */
async function requireServicePrincipalInOrganization(
  ctx: DbCtx,
  servicePrincipalId: Id<"service_principals">,
  organizationId: Id<"organizations">,
): Promise<Doc<"service_principals">> {
  const servicePrincipal = await requireServicePrincipal(ctx, servicePrincipalId);
  if (servicePrincipal.organizationId !== organizationId) {
    throw new Error("Service principal not found");
  }
  return servicePrincipal;
}

async function requireOrganization(ctx: DbCtx, organizationId: Id<"organizations">) {
  const organization = await ctx.db.get("organizations", organizationId);
  if (organization === null) {
    throw new Error("Organization not found");
  }
}

async function requireUser(ctx: DbCtx, userId: Id<"users">) {
  const user = await ctx.db.get("users", userId);
  if (user === null) {
    throw new Error("User not found");
  }
}

function normalizeRequired(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

function normalizeOptional(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function normalizeStringArray(values: readonly string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function resolveListLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return 100;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 500);
}
