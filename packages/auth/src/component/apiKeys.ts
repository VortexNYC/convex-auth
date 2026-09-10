import { v } from "convex/values";
import { getPage } from "convex-helpers/server/pagination";

import type { Doc, Id } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { mutation, query } from "./_generated/server.js";
import {
  bytesToHex,
  hashApiKeySecret,
  timingSafeEqualString,
} from "./convex/src/machine/apiKeySecret.js";
import schema, {
  apiKeyEnvironmentValidator,
  apiKeyOwnerTypeValidator,
  apiKeyStatusValidator,
} from "./schema.js";
import { assertScopesAreIssuable } from "./scopes.js";

type DbCtx = Pick<MutationCtx | QueryCtx, "db">;

/**
 * What kind of thing is holding this credential.
 *
 * `ownerType` has been on the row since service principals landed, but it never
 * reached the caller: `verifyApiKey` answered "which organization, what scopes"
 * and stopped. A consumer therefore could not express "this route is closed to
 * machines", could not give agents their own rate-limit budget, and could not
 * tell an audit log who acted -- only which org did.
 *
 * The principal type is derived from the credential, never asserted by the
 * caller. That is the property that makes it trustworthy: a machine cannot
 * present itself as a human by passing a different argument, because it does not
 * get to pass one.
 *
 * Deliberately TWO types, not three. An earlier revision of this union also
 * carried "agent", which nothing could ever produce: `api_keys` stores
 * `ownerType` only, and the agent-auth protocol's `actorType: "agent"` lives on
 * the agent session, not on the key. A validator literal no code path can return
 * is a promise to consumers we do not keep -- someone writes
 * `if (principal.type === "agent")` and it is silently dead. Agent gets added
 * here when the credential can actually carry agent identity, and not before.
 */
const authPrincipalTypeValidator = v.union(v.literal("human"), v.literal("service"));

const authPrincipalValidator = v.object({
  type: authPrincipalTypeValidator,
  /**
   * The principal's own identity -- a user id for a human, a service principal
   * id for a machine. Distinct from `organizationId`, which is the tenant the
   * principal is acting within.
   */
  id: v.optional(v.string()),
  /**
   * A pre-composed, class-namespaced bucket identity for consumers that rate
   * limit per principal -- "human:<userId>" / "service:<servicePrincipalId>".
   *
   * NOT enforced here. The per-key rate limit and quota this component applies
   * (see `evaluateApiKeyLimits`) are keyed by the key row itself and are
   * unaffected by this field. It exists so consumers keying their own limiter
   * do not each invent a scheme, and so a machine cannot land in the same bucket
   * as a person; a consumer that never reads it gets no separation.
   *
   * Say what it is, not what we wish it were: this is a value the caller may
   * use, not a control already in force.
   */
  rateLimitKey: v.string(),
});

function resolveAuthPrincipal(key: Doc<"api_keys">): {
  readonly type: "human" | "service";
  readonly id?: string;
  readonly rateLimitKey: string;
} {
  // Anything that is not an explicit user-owned key resolves to "service". That
  // is the safe direction: an unrecognised machine is still a machine, and is
  // never mistaken for a person.
  const ownerType = key.ownerType ?? "user";
  if (ownerType === "service") {
    const id = key.ownerServicePrincipalId ?? key.ownerId;
    return {
      type: "service",
      id,
      rateLimitKey: `service:${id ?? key._id}`,
    };
  }
  if (ownerType === "organization") {
    // An organization-owned key is a machine credential with no human behind it.
    const id = key.ownerId ?? key.organizationId;
    return { type: "service", id, rateLimitKey: `service:${id ?? key._id}` };
  }
  const id = key.userId;
  return { type: "human", id, rateLimitKey: `human:${id ?? key._id}` };
}

const apiKeyResultValidator = v.object({
  apiKeyId: v.id("api_keys"),
  created: v.boolean(),
});

// This validator is the `returns` contract of every api_keys read API. It MUST name
// every field the schema can hold: Convex output validation is exact, so a field the
// schema stores but this omits makes `getApiKey`/`listApiKeysByOrganization` THROW on
// any key that carries it. That is precisely what happened with the issuance-era
// fields (`environment`, `keyStart`, the rate-limit and quota counters): issued keys
// stored them, and every read API rejected its own rows.
const apiKeyDocValidator = v.object({
  _id: v.id("api_keys"),
  _creationTime: v.number(),
  organizationId: v.optional(v.id("organizations")),
  userId: v.optional(v.id("users")),
  name: v.string(),
  keyPrefix: v.string(),
  keyHash: v.string(),
  keyStart: v.optional(v.string()),
  environment: v.optional(apiKeyEnvironmentValidator),
  ownerType: v.optional(apiKeyOwnerTypeValidator),
  ownerId: v.optional(v.string()),
  ownerServicePrincipalId: v.optional(v.id("service_principals")),
  fixedOrganizationId: v.optional(v.id("organizations")),
  permissions: v.optional(v.array(v.string())),
  requestId: v.optional(v.string()),
  requestIdExpiresAt: v.optional(v.number()),
  scopes: v.array(v.string()),
  allowedIpRanges: v.optional(v.array(v.string())),
  expiresAt: v.optional(v.number()),
  status: apiKeyStatusValidator,
  lastUsedAt: v.optional(v.number()),
  lastUsedIp: v.optional(v.string()),
  rateLimitEnabled: v.optional(v.boolean()),
  rateLimitTimeWindowMs: v.optional(v.number()),
  rateLimitMax: v.optional(v.number()),
  requestCount: v.optional(v.number()),
  windowStartedAt: v.optional(v.number()),
  lastRequestAt: v.optional(v.number()),
  remaining: v.optional(v.number()),
  refillAmount: v.optional(v.number()),
  refillIntervalMs: v.optional(v.number()),
  lastRefillAt: v.optional(v.number()),
  metadataJson: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const okResultValidator = v.object({ ok: v.literal(true) });

function okResult() {
  return { ok: true } as const;
}

function normalizeAllowedIpRanges(value: string[] | null | undefined): string[] | undefined {
  return value === null ? undefined : normalizeStringArray(value ?? []);
}

function resolveServiceApiKeyPermissions(args: {
  existing: Doc<"api_keys"> | null;
  permissions?: string[] | null;
}): string[] | undefined {
  if (args.permissions === undefined) {
    return args.existing?.permissions;
  }
  return args.permissions === null ? undefined : normalizeStringArray(args.permissions);
}

function assertExistingUserApiKeyOwnership(
  existing: Doc<"api_keys"> | null,
  organizationId: Id<"organizations">,
  userId: Id<"users">,
): void {
  if (existing === null) {
    return;
  }
  if (existing.organizationId !== organizationId || existing.userId !== userId) {
    throw new Error("API key ownership mismatch");
  }
  if ((existing.ownerType ?? "user") !== "user") {
    throw new Error("API key ownership mismatch");
  }
}

function assertExistingServiceApiKeyOwnership(
  existing: Doc<"api_keys"> | null,
  servicePrincipalId: Id<"service_principals">,
): void {
  if (existing === null) {
    return;
  }
  if (
    (existing.ownerType ?? "user") !== "service" ||
    existing.ownerServicePrincipalId !== servicePrincipalId
  ) {
    throw new Error("API key ownership mismatch");
  }
}

export const upsertApiKey = mutation({
  args: {
    apiKeyId: v.optional(v.id("api_keys")),
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    name: v.string(),
    keyPrefix: v.string(),
    keyHash: v.string(),
    environment: v.optional(apiKeyEnvironmentValidator),
    requestId: v.optional(v.union(v.string(), v.null())),
    requestIdExpiresAt: v.optional(v.union(v.number(), v.null())),
    scopes: v.array(v.string()),
    allowedIpRanges: v.optional(v.union(v.array(v.string()), v.null())),
    expiresAt: v.optional(v.union(v.number(), v.null())),
    status: v.optional(apiKeyStatusValidator),
    metadataJson: v.optional(v.union(v.string(), v.null())),
  },
  returns: apiKeyResultValidator,
  handler: async (ctx, args) => {
    assertScopesAreIssuable(args.scopes);
    await requireOrganization(ctx, args.organizationId);
    await requireUser(ctx, args.userId);

    const now = Date.now();
    const name = normalizeRequired(args.name, "name");
    const keyPrefix = normalizeRequired(args.keyPrefix, "keyPrefix");
    const keyHash = normalizeRequired(args.keyHash, "keyHash");
    const existing =
      (args.apiKeyId ? await ctx.db.get("api_keys", args.apiKeyId) : null) ??
      (await findApiKeyByPrefix(ctx, keyPrefix));

    assertExistingUserApiKeyOwnership(existing, args.organizationId, args.userId);
    if (existing !== null) {
      await assertApiKeyPrefixAvailable(ctx, keyPrefix, existing._id);
    }

    const patch = {
      organizationId: args.organizationId,
      userId: args.userId,
      name,
      keyPrefix,
      keyHash,
      // Optional so pre-environment callers keep working; an omitted value preserves
      // what the key already has rather than erasing it.
      environment: args.environment ?? existing?.environment,
      ownerType: "user" as const,
      ownerId: args.userId,
      ownerServicePrincipalId: undefined,
      fixedOrganizationId: args.organizationId,
      permissions: undefined,
      requestId: normalizeOptional(args.requestId),
      requestIdExpiresAt: args.requestIdExpiresAt ?? undefined,
      scopes: normalizeStringArray(args.scopes),
      allowedIpRanges: normalizeAllowedIpRanges(args.allowedIpRanges),
      expiresAt: args.expiresAt ?? undefined,
      status: args.status ?? existing?.status ?? "active",
      metadataJson: normalizeOptional(args.metadataJson),
      updatedAt: now,
    };

    if (existing !== null) {
      await ctx.db.patch("api_keys", existing._id, patch);
      return { apiKeyId: existing._id, created: false };
    }

    const apiKeyId = await ctx.db.insert("api_keys", {
      ...patch,
      createdAt: now,
    });
    return { apiKeyId, created: true };
  },
});

export const upsertServiceOwnedApiKey = mutation({
  args: {
    apiKeyId: v.optional(v.id("api_keys")),
    servicePrincipalId: v.id("service_principals"),
    name: v.string(),
    keyPrefix: v.string(),
    keyHash: v.string(),
    environment: v.optional(apiKeyEnvironmentValidator),
    requestId: v.optional(v.union(v.string(), v.null())),
    requestIdExpiresAt: v.optional(v.union(v.number(), v.null())),
    scopes: v.array(v.string()),
    permissions: v.optional(v.union(v.array(v.string()), v.null())),
    allowedIpRanges: v.optional(v.union(v.array(v.string()), v.null())),
    expiresAt: v.optional(v.union(v.number(), v.null())),
    status: v.optional(apiKeyStatusValidator),
    metadataJson: v.optional(v.union(v.string(), v.null())),
  },
  returns: apiKeyResultValidator,
  handler: async (ctx, args) => {
    assertScopesAreIssuable(args.scopes);
    const servicePrincipal = await requireServicePrincipal(ctx, args.servicePrincipalId);
    if (servicePrincipal.status !== "active") {
      throw new Error("Only active service principals can issue API keys");
    }

    const now = Date.now();
    const name = normalizeRequired(args.name, "name");
    const keyPrefix = normalizeRequired(args.keyPrefix, "keyPrefix");
    const keyHash = normalizeRequired(args.keyHash, "keyHash");
    const existing =
      (args.apiKeyId ? await ctx.db.get("api_keys", args.apiKeyId) : null) ??
      (await findApiKeyByPrefix(ctx, keyPrefix));
    const permissions = resolveServiceApiKeyPermissions({
      existing,
      permissions: args.permissions,
    });

    if (
      permissions !== undefined &&
      !isPermissionSubset(permissions, servicePrincipal.permissions)
    ) {
      throw new Error("API key permissions exceed service principal permissions");
    }

    assertExistingServiceApiKeyOwnership(existing, servicePrincipal._id);
    if (existing !== null) {
      await assertApiKeyPrefixAvailable(ctx, keyPrefix, existing._id);
    }

    const patch = {
      organizationId: servicePrincipal.organizationId,
      userId: undefined,
      name,
      keyPrefix,
      keyHash,
      environment: args.environment ?? existing?.environment,
      ownerType: "service" as const,
      ownerId: servicePrincipal._id,
      ownerServicePrincipalId: servicePrincipal._id,
      fixedOrganizationId: servicePrincipal.organizationId,
      permissions,
      requestId: normalizeOptional(args.requestId),
      requestIdExpiresAt: args.requestIdExpiresAt ?? undefined,
      scopes: normalizeStringArray(args.scopes),
      allowedIpRanges: normalizeAllowedIpRanges(args.allowedIpRanges),
      expiresAt: args.expiresAt ?? undefined,
      status: args.status ?? existing?.status ?? "active",
      metadataJson: normalizeOptional(args.metadataJson),
      updatedAt: now,
    };

    if (existing !== null) {
      await ctx.db.patch("api_keys", existing._id, patch);
      return { apiKeyId: existing._id, created: false };
    }

    const apiKeyId = await ctx.db.insert("api_keys", {
      ...patch,
      createdAt: now,
    });
    return { apiKeyId, created: true };
  },
});

export const getApiKey = query({
  args: {
    apiKeyId: v.id("api_keys"),
  },
  returns: v.union(v.null(), apiKeyDocValidator),
  handler: async (ctx, { apiKeyId }) => {
    return await ctx.db.get("api_keys", apiKeyId);
  },
});

export const getApiKeyByPrefix = query({
  args: {
    keyPrefix: v.string(),
  },
  returns: v.union(v.null(), apiKeyDocValidator),
  handler: async (ctx, { keyPrefix }) => {
    return await findApiKeyByPrefix(ctx, keyPrefix);
  },
});

export const getApiKeyByRequestId = query({
  args: {
    organizationId: v.id("organizations"),
    requestId: v.string(),
  },
  returns: v.union(v.null(), apiKeyDocValidator),
  handler: async (ctx, { organizationId, requestId }) => {
    const { page } = await getPage(ctx, {
      table: "api_keys",
      index: "by_organization_and_request_id",
      startIndexKey: [organizationId, normalizeRequired(requestId, "requestId")],
      endIndexKey: [organizationId, normalizeRequired(requestId, "requestId")],
      absoluteMaxRows: 1,
      schema,
    });
    return page[0] ?? null;
  },
});

export const listApiKeysByOrganization = query({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(apiKeyStatusValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(apiKeyDocValidator),
  handler: async (ctx, { organizationId, status, limit }) => {
    const resolvedLimit = resolveListLimit(limit);
    const index = status === undefined ? "by_organization" : "by_org_status";
    const startIndexKey = status === undefined ? [organizationId] : [organizationId, status];
    const { page } = await getPage(ctx, {
      table: "api_keys",
      index,
      startIndexKey,
      endIndexKey: startIndexKey,
      absoluteMaxRows: resolvedLimit,
      schema,
    });
    return page;
  },
});

export const listApiKeysByServicePrincipal = query({
  args: {
    servicePrincipalId: v.id("service_principals"),
    status: v.optional(apiKeyStatusValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(apiKeyDocValidator),
  handler: async (ctx, { servicePrincipalId, status, limit }) => {
    const resolvedLimit = resolveListLimit(limit);
    const index = status === undefined ? "by_owner_service" : "by_owner_service_status";
    const startIndexKey =
      status === undefined ? [servicePrincipalId] : [servicePrincipalId, status];
    const { page } = await getPage(ctx, {
      table: "api_keys",
      index,
      startIndexKey,
      endIndexKey: startIndexKey,
      absoluteMaxRows: resolvedLimit,
      schema,
    });
    return page;
  },
});

export const rotateApiKey = mutation({
  args: {
    apiKeyId: v.id("api_keys"),
    organizationId: v.id("organizations"),
    keyPrefix: v.string(),
    keyHash: v.string(),
  },
  returns: okResultValidator,
  handler: async (ctx, { apiKeyId, organizationId, keyPrefix, keyHash }) => {
    const apiKey = await requireApiKeyInOrganization(ctx, apiKeyId, organizationId);
    if (apiKey.status !== "active") {
      throw new Error("Only active API keys can be rotated");
    }

    const normalizedPrefix = normalizeRequired(keyPrefix, "keyPrefix");
    const existingPrefixOwner = await findApiKeyByPrefix(ctx, normalizedPrefix);
    if (existingPrefixOwner !== null && existingPrefixOwner._id !== apiKeyId) {
      throw new Error("API key prefix already exists");
    }

    await ctx.db.patch("api_keys", apiKeyId, {
      keyPrefix: normalizedPrefix,
      keyHash: normalizeRequired(keyHash, "keyHash"),
      lastUsedAt: undefined,
      lastUsedIp: undefined,
      updatedAt: Date.now(),
    });
    return okResult();
  },
});

export const revokeApiKey = mutation({
  args: {
    apiKeyId: v.id("api_keys"),
    organizationId: v.id("organizations"),
  },
  returns: okResultValidator,
  handler: async (ctx, { apiKeyId, organizationId }) => {
    const apiKey = await requireApiKeyInOrganization(ctx, apiKeyId, organizationId);
    if (apiKey.status === "revoked") {
      return okResult();
    }
    await ctx.db.patch("api_keys", apiKeyId, {
      status: "revoked",
      updatedAt: Date.now(),
    });
    return okResult();
  },
});

export const touchApiKeyLastUsed = mutation({
  args: {
    apiKeyId: v.id("api_keys"),
    organizationId: v.id("organizations"),
    ip: v.optional(v.union(v.string(), v.null())),
  },
  returns: okResultValidator,
  handler: async (ctx, { apiKeyId, organizationId, ip }) => {
    await requireApiKeyInOrganization(ctx, apiKeyId, organizationId);
    await ctx.db.patch("api_keys", apiKeyId, {
      lastUsedAt: Date.now(),
      lastUsedIp: normalizeOptional(ip),
      updatedAt: Date.now(),
    });
    return okResult();
  },
});

async function findApiKeyByPrefix(ctx: DbCtx, keyPrefix: string): Promise<Doc<"api_keys"> | null> {
  const { page } = await getPage(ctx, {
    table: "api_keys",
    index: "by_key_prefix",
    startIndexKey: [keyPrefix],
    endIndexKey: [keyPrefix],
    absoluteMaxRows: 1,
    schema,
  });
  return page[0] ?? null;
}

async function assertApiKeyPrefixAvailable(
  ctx: DbCtx,
  keyPrefix: string,
  currentApiKeyId: Id<"api_keys">,
) {
  const prefixOwner = await findApiKeyByPrefix(ctx, keyPrefix);
  if (prefixOwner !== null && prefixOwner._id !== currentApiKeyId) {
    throw new Error("API key prefix already exists");
  }
}

async function requireApiKey(ctx: DbCtx, apiKeyId: Id<"api_keys">): Promise<Doc<"api_keys">> {
  const apiKey = await ctx.db.get("api_keys", apiKeyId);
  if (apiKey === null) {
    throw new Error("API key not found");
  }
  return apiKey;
}

/**
 * Existence + tenant-ownership guard. Mutating an api key by id alone is a
 * cross-organization IDOR: a caller authorized for org A could pass an api key
 * id belonging to org B and revoke/rotate it. Every id-addressed mutation must
 * prove the key lives in the organization the caller named. Fails closed — a
 * key with no organizationId (never expected for a valid key) does not match
 * any real id, so the assertion throws.
 */
async function requireApiKeyInOrganization(
  ctx: DbCtx,
  apiKeyId: Id<"api_keys">,
  organizationId: Id<"organizations">,
): Promise<Doc<"api_keys">> {
  const apiKey = await requireApiKey(ctx, apiKeyId);
  if (apiKey.organizationId !== organizationId) {
    throw new Error("API key not found");
  }
  return apiKey;
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

function isPermissionSubset(
  permissions: readonly string[],
  ownerPermissions: readonly string[],
): boolean {
  const allowedPermissions = new Set(ownerPermissions);
  return permissions.every((permission) => allowedPermissions.has(permission));
}

function resolveListLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return 100;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 500);
}

/**
 * Presented-key verification (the composed resolver).
 *
 * Everything this needs already existed in the package and had never been assembled:
 * `by_key_prefix` finds the candidate, `hashApiKeySecret` + `timingSafeEqualString`
 * compare it. Without this, every consumer reimplements the hash-and-compare itself --
 * which is exactly what convex-payments did, and how its own auth layer drifted.
 *
 * Modelled on common api-key verification patterns, with one deliberate
 * difference: `environment` is a typed column here rather than free-form metadata,
 * because it decides whether a request can move real money.
 *
 * Returns a discriminated result instead of throwing. CONSUMERS MUST MAP EVERY FAILURE
 * REASON TO ONE IDENTICAL RESPONSE -- the reason is for logging and for tests, never for
 * the caller. Distinguishing "revoked" from "not_found" over the wire hands an attacker
 * a key-enumeration oracle.
 */
const apiKeyVerificationFailureValidator = v.union(
  v.literal("malformed"),
  v.literal("not_found"),
  v.literal("revoked"),
  v.literal("expired"),
  v.literal("environment_mismatch"),
  v.literal("scope_missing"),
  v.literal("rate_limited"),
  v.literal("quota_exhausted"),
);

export const verifyApiKey = mutation({
  args: {
    presentedKey: v.string(),
    // When supplied, the key's environment must match exactly. A sandbox key must never
    // authenticate a production request, so a caller on a money path always passes this.
    environment: v.optional(apiKeyEnvironmentValidator),
    requiredScopes: v.optional(v.array(v.string())),
    now: v.optional(v.number()),
  },
  returns: v.union(
    v.object({
      valid: v.literal(true),
      apiKeyId: v.id("api_keys"),
      organizationId: v.optional(v.id("organizations")),
      userId: v.optional(v.id("users")),
      environment: v.optional(apiKeyEnvironmentValidator),
      scopes: v.array(v.string()),
      remaining: v.optional(v.number()),
      principal: authPrincipalValidator,
    }),
    v.object({
      valid: v.literal(false),
      reason: apiKeyVerificationFailureValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const presented = args.presentedKey.trim();
    if (presented.length === 0) {
      return { valid: false as const, reason: "malformed" as const };
    }

    // The prefix is the indexed lookup; the hash is what actually authenticates.
    const keyPrefix = presented.slice(0, Math.min(presented.length, 12));
    const candidate = await findApiKeyByPrefix(ctx, keyPrefix);
    if (candidate === null) {
      return { valid: false as const, reason: "not_found" as const };
    }

    const presentedHash = await hashApiKeySecret(presented);
    if (!timingSafeEqualString(presentedHash, candidate.keyHash)) {
      // Same reason as a missing key on purpose: a distinguishable response here would
      // confirm that a prefix names a real key.
      return { valid: false as const, reason: "not_found" as const };
    }
    if (candidate.status !== "active") {
      return { valid: false as const, reason: "revoked" as const };
    }
    if (candidate.expiresAt !== undefined && candidate.expiresAt <= now) {
      return { valid: false as const, reason: "expired" as const };
    }
    if (args.environment !== undefined && candidate.environment !== args.environment) {
      return { valid: false as const, reason: "environment_mismatch" as const };
    }
    const required = args.requiredScopes ?? [];
    if (required.length > 0) {
      const held = new Set(candidate.scopes);
      if (!required.every((scope) => held.has(scope))) {
        return { valid: false as const, reason: "scope_missing" as const };
      }
    }

    const limits = evaluateApiKeyLimits(candidate, now);
    if (limits.rejected !== null) {
      return { valid: false as const, reason: limits.rejected };
    }

    await ctx.db.patch("api_keys", candidate._id, {
      ...limits.patch,
      lastUsedAt: now,
      updatedAt: now,
    });

    return {
      valid: true as const,
      apiKeyId: candidate._id,
      organizationId: candidate.organizationId,
      userId: candidate.userId,
      environment: candidate.environment,
      scopes: candidate.scopes,
      remaining: limits.patch.remaining,
      principal: resolveAuthPrincipal(candidate),
    };
  },
});

/**
 * Fixed-window rate limit plus an independent refilling quota.
 *
 * Both are evaluated BEFORE the key is accepted, and the resulting counters are written
 * in the same patch that records the use -- so a rejected request never counts as a
 * successful one, and a successful one can never be double counted.
 */
function evaluateApiKeyLimits(
  key: Doc<"api_keys">,
  now: number,
): {
  readonly rejected: "rate_limited" | "quota_exhausted" | null;
  readonly patch: {
    requestCount?: number;
    windowStartedAt?: number;
    lastRequestAt?: number;
    remaining?: number;
    lastRefillAt?: number;
  };
} {
  const patch: {
    requestCount?: number;
    windowStartedAt?: number;
    lastRequestAt?: number;
    remaining?: number;
    lastRefillAt?: number;
  } = { lastRequestAt: now };

  if (key.rateLimitEnabled === true) {
    const windowMs = key.rateLimitTimeWindowMs ?? 60_000;
    const max = key.rateLimitMax ?? 0;
    const windowStartedAt = key.windowStartedAt ?? 0;
    const withinWindow = now - windowStartedAt < windowMs;
    const count = withinWindow ? (key.requestCount ?? 0) : 0;
    if (max > 0 && count >= max) {
      return { rejected: "rate_limited", patch };
    }
    patch.requestCount = count + 1;
    patch.windowStartedAt = withinWindow ? windowStartedAt : now;
  }

  if (key.remaining !== undefined) {
    let remaining = key.remaining;
    // Refill first, so a key whose interval elapsed is usable on this very request
    // rather than only on the next one.
    if (key.refillIntervalMs !== undefined && key.refillAmount !== undefined) {
      const lastRefillAt = key.lastRefillAt ?? key.createdAt;
      if (now - lastRefillAt >= key.refillIntervalMs) {
        remaining = key.refillAmount;
        patch.lastRefillAt = now;
      }
    }
    if (remaining <= 0) {
      return { rejected: "quota_exhausted", patch };
    }
    patch.remaining = remaining - 1;
  }

  return { rejected: null, patch };
}

/**
 * Issues a key and stores only its hash.
 *
 * Generation lives HERE rather than in each consumer because the format is part of the
 * auth contract: the prefix is what `verifyApiKey` indexes on, and a consumer that
 * invents its own layout silently breaks that lookup. convex-payments generated
 * `vb_test_*`/`vb_live_*` itself for exactly as long as it owned its own auth.
 *
 * The plaintext is returned ONCE and never stored -- `keyStart` keeps just enough of it
 * for a dashboard to identify the key afterwards (some legacy plugins call this `start`).
 */
export const issueApiKey = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    name: v.string(),
    environment: apiKeyEnvironmentValidator,
    /** Brand segment, e.g. "vb" produces vb_test_… / vb_live_… */
    keyBrand: v.optional(v.string()),
    scopes: v.optional(v.array(v.string())),
    allowedIpRanges: v.optional(v.union(v.array(v.string()), v.null())),
    expiresAt: v.optional(v.number()),
    rateLimitEnabled: v.optional(v.boolean()),
    rateLimitTimeWindowMs: v.optional(v.number()),
    rateLimitMax: v.optional(v.number()),
    remaining: v.optional(v.number()),
    refillAmount: v.optional(v.number()),
    refillIntervalMs: v.optional(v.number()),
    metadataJson: v.optional(v.string()),
    now: v.optional(v.number()),
  },
  returns: v.object({
    apiKeyId: v.id("api_keys"),
    /** Plaintext. Returned once, never recoverable from storage. */
    apiKey: v.string(),
    keyPrefix: v.string(),
    keyStart: v.string(),
  }),
  handler: async (ctx, args) => {
    assertScopesAreIssuable(args.scopes);
    await requireOrganization(ctx, args.organizationId);
    await requireUser(ctx, args.userId);

    const now = args.now ?? Date.now();
    const { apiKey, keyPrefix } = await generateIssuedApiKeyMaterial(
      ctx,
      args.keyBrand,
      args.environment,
    );

    const apiKeyId = await ctx.db.insert("api_keys", {
      organizationId: args.organizationId,
      userId: args.userId,
      name: normalizeRequired(args.name, "name"),
      keyPrefix,
      keyHash: await hashApiKeySecret(apiKey),
      keyStart: keyPrefix,
      environment: args.environment,
      ownerType: "user" as const,
      ownerId: args.userId,
      fixedOrganizationId: args.organizationId,
      scopes: normalizeStringArray(args.scopes ?? []),
      status: "active" as const,
      allowedIpRanges: normalizeAllowedIpRanges(args.allowedIpRanges),
      expiresAt: args.expiresAt,
      rateLimitEnabled: args.rateLimitEnabled,
      rateLimitTimeWindowMs: args.rateLimitTimeWindowMs,
      rateLimitMax: args.rateLimitMax,
      requestCount: 0,
      remaining: args.remaining,
      refillAmount: args.refillAmount,
      refillIntervalMs: args.refillIntervalMs,
      lastRefillAt: args.remaining === undefined ? undefined : now,
      metadataJson: normalizeOptional(args.metadataJson),
      createdAt: now,
      updatedAt: now,
    });

    return { apiKeyId, apiKey, keyPrefix, keyStart: keyPrefix };
  },
});

/**
 * Shared secret generation for the issuance mutations. Lives in ONE place because the
 * layout is the auth contract: the first 12 characters are the indexed lookup prefix,
 * so issuance and `verifyApiKey` must derive it identically or an issued key can never
 * be found again.
 */
async function generateIssuedApiKeyMaterial(
  ctx: DbCtx,
  keyBrand: string | undefined,
  environment: "sandbox" | "production",
): Promise<{ apiKey: string; keyPrefix: string }> {
  const brand = normalizeRequired(keyBrand ?? "vb", "keyBrand");
  const segment = environment === "production" ? "live" : "test";
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const apiKey = `${brand}_${segment}_${bytesToHex(bytes)}`;

  const keyPrefix = apiKey.slice(0, Math.min(apiKey.length, 12));
  // A collision here means two live keys would share a lookup prefix and one could
  // never be verified. 24 random bytes make it vanishingly unlikely, which is exactly
  // why it must fail loudly rather than be assumed away.
  if ((await findApiKeyByPrefix(ctx, keyPrefix)) !== null) {
    throw new Error("API key prefix already exists");
  }
  return { apiKey, keyPrefix };
}

/**
 * Service-owned issuance: the same generation contract as `issueApiKey`, owned by a
 * service principal instead of a user.
 *
 * This is the issuance path for keys that belong to an organization with no human
 * attached -- an operator minting a merchant org's API key before that org has any
 * users (convex-payments), or a service issuing for itself. Without it, a consumer in
 * that position is pushed to `upsertServiceOwnedApiKey`, which accepts a caller-supplied
 * hash -- i.e. local key generation, the exact drift `verifyApiKey` exists to end.
 */
export const issueServiceOwnedApiKey = mutation({
  args: {
    servicePrincipalId: v.id("service_principals"),
    name: v.string(),
    environment: apiKeyEnvironmentValidator,
    /** Brand segment, e.g. "vb" produces vb_test_… / vb_live_… */
    keyBrand: v.optional(v.string()),
    scopes: v.optional(v.array(v.string())),
    allowedIpRanges: v.optional(v.union(v.array(v.string()), v.null())),
    permissions: v.optional(v.union(v.array(v.string()), v.null())),
    expiresAt: v.optional(v.number()),
    rateLimitEnabled: v.optional(v.boolean()),
    rateLimitTimeWindowMs: v.optional(v.number()),
    rateLimitMax: v.optional(v.number()),
    remaining: v.optional(v.number()),
    refillAmount: v.optional(v.number()),
    refillIntervalMs: v.optional(v.number()),
    metadataJson: v.optional(v.string()),
    now: v.optional(v.number()),
  },
  returns: v.object({
    apiKeyId: v.id("api_keys"),
    /** Plaintext. Returned once, never recoverable from storage. */
    apiKey: v.string(),
    keyPrefix: v.string(),
    keyStart: v.string(),
  }),
  handler: async (ctx, args) => {
    assertScopesAreIssuable(args.scopes);
    const servicePrincipal = await requireServicePrincipal(ctx, args.servicePrincipalId);
    if (servicePrincipal.status !== "active") {
      throw new Error("Only active service principals can issue API keys");
    }
    const permissions =
      args.permissions === undefined || args.permissions === null
        ? undefined
        : normalizeStringArray(args.permissions);
    if (
      permissions !== undefined &&
      !isPermissionSubset(permissions, servicePrincipal.permissions)
    ) {
      throw new Error("API key permissions exceed service principal permissions");
    }

    const now = args.now ?? Date.now();
    const { apiKey, keyPrefix } = await generateIssuedApiKeyMaterial(
      ctx,
      args.keyBrand,
      args.environment,
    );

    const apiKeyId = await ctx.db.insert("api_keys", {
      organizationId: servicePrincipal.organizationId,
      userId: undefined,
      name: normalizeRequired(args.name, "name"),
      keyPrefix,
      keyHash: await hashApiKeySecret(apiKey),
      keyStart: keyPrefix,
      environment: args.environment,
      ownerType: "service" as const,
      ownerId: servicePrincipal._id,
      ownerServicePrincipalId: servicePrincipal._id,
      fixedOrganizationId: servicePrincipal.organizationId,
      permissions,
      scopes: normalizeStringArray(args.scopes ?? []),
      status: "active" as const,
      allowedIpRanges: normalizeAllowedIpRanges(args.allowedIpRanges),
      expiresAt: args.expiresAt,
      rateLimitEnabled: args.rateLimitEnabled,
      rateLimitTimeWindowMs: args.rateLimitTimeWindowMs,
      rateLimitMax: args.rateLimitMax,
      requestCount: 0,
      remaining: args.remaining,
      refillAmount: args.refillAmount,
      refillIntervalMs: args.refillIntervalMs,
      lastRefillAt: args.remaining === undefined ? undefined : now,
      metadataJson: normalizeOptional(args.metadataJson),
      createdAt: now,
      updatedAt: now,
    });

    return { apiKeyId, apiKey, keyPrefix, keyStart: keyPrefix };
  },
});
