import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { components } from "./_generated/api";

const dayInMs = 24 * 60 * 60 * 1000;

function parseAllowedIpRanges(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getExpiresAt(expiresInDays: string, now = Date.now()): number | undefined {
  if (expiresInDays === "none" || expiresInDays.trim().length === 0) {
    return undefined;
  }
  const days = Number(expiresInDays);
  if (!Number.isFinite(days) || days <= 0) {
    return undefined;
  }
  return now + days * dayInMs;
}

const apiKeyListItemValidator = v.object({
  _id: v.string(),
  name: v.string(),
  keyPrefix: v.string(),
  scopes: v.array(v.string()),
  allowedIpRanges: v.array(v.string()),
  expiresAt: v.optional(v.number()),
  status: v.union(v.literal("active"), v.literal("revoked")),
  lastUsedAt: v.optional(v.number()),
  lastUsedIp: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  createdBy: v.optional(
    v.union(
      v.null(),
      v.object({
        _id: v.string(),
        name: v.optional(v.string()),
        email: v.string(),
      }),
    ),
  ),
});

const createdApiKeyValidator = v.object({
  apiKeyId: v.string(),
  apiKey: v.string(),
  keyPrefix: v.string(),
  keyStart: v.string(),
});

export const listMyApiKeys = query({
  args: {},
  returns: v.array(apiKeyListItemValidator),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const userId = identity.subject;
    const user = await ctx.runQuery(components.convexAuth.native.users.getUserById, { userId });
    const organizationId = user?.activeOrganizationId;
    if (!organizationId) return [];
    const keys = await ctx.runQuery(components.convexAuth.apiKeys.listApiKeysByOrganization, {
      organizationId,
      status: "active",
      limit: 100,
    });
    const results = [];
    for (const key of keys) {
      const creator = key.userId
        ? await ctx.runQuery(components.convexAuth.native.users.getUserById, { userId: key.userId })
        : null;
      results.push({
        _id: key._id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        scopes: key.scopes,
        allowedIpRanges: key.allowedIpRanges ?? [],
        expiresAt: key.expiresAt,
        status: key.status,
        lastUsedAt: key.lastUsedAt,
        lastUsedIp: key.lastUsedIp,
        createdAt: key.createdAt,
        updatedAt: key.updatedAt,
        createdBy: creator
          ? {
              _id: creator._id,
              name: creator.name,
              email: creator.email,
            }
          : null,
      });
    }
    return results;
  },
});

export const createApiKey = mutation({
  args: {
    name: v.string(),
    scopes: v.array(v.string()),
    ipAllowlist: v.string(),
    expiresInDays: v.string(),
  },
  returns: createdApiKeyValidator,
  handler: async (ctx, { name, scopes, ipAllowlist, expiresInDays }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("UNAUTHORIZED");
    const userId = identity.subject;
    const user = await ctx.runQuery(components.convexAuth.native.users.getUserById, { userId });
    const organizationId = user?.activeOrganizationId;
    if (!organizationId) throw new Error("No active workspace");
    const allowedIpRanges = parseAllowedIpRanges(ipAllowlist);
    const expiresAt = getExpiresAt(expiresInDays);
    const { apiKeyId, apiKey, keyPrefix, keyStart } = await ctx.runMutation(
      components.convexAuth.apiKeys.issueApiKey,
      {
        organizationId,
        userId,
        name,
        environment: "production",
        scopes,
        allowedIpRanges: allowedIpRanges.length > 0 ? allowedIpRanges : null,
        expiresAt,
      },
    );
    return { apiKeyId, apiKey, keyPrefix, keyStart };
  },
});

export const revokeApiKey = mutation({
  args: {
    apiKeyId: v.string(),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, { apiKeyId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("UNAUTHORIZED");
    const userId = identity.subject;
    const user = await ctx.runQuery(components.convexAuth.native.users.getUserById, { userId });
    const organizationId = user?.activeOrganizationId;
    if (!organizationId) throw new Error("No active workspace");
    await ctx.runMutation(components.convexAuth.apiKeys.revokeApiKey, {
      apiKeyId,
      organizationId,
    });
    return { ok: true as const };
  },
});

export const rotateApiKey = mutation({
  args: {
    apiKeyId: v.string(),
  },
  returns: createdApiKeyValidator,
  handler: async (ctx, { apiKeyId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("UNAUTHORIZED");
    const userId = identity.subject;
    const user = await ctx.runQuery(components.convexAuth.native.users.getUserById, { userId });
    const organizationId = user?.activeOrganizationId;
    if (!organizationId) throw new Error("No active workspace");
    const key = await ctx.runQuery(components.convexAuth.apiKeys.getApiKey, { apiKeyId });
    if (!key || key.organizationId !== organizationId) throw new Error("API key not found");
    const allowedIpRanges = key.allowedIpRanges ?? [];
    const {
      apiKeyId: newId,
      apiKey,
      keyPrefix,
      keyStart,
    } = await ctx.runMutation(components.convexAuth.apiKeys.issueApiKey, {
      organizationId,
      userId,
      name: key.name,
      environment: key.environment ?? "production",
      scopes: key.scopes,
      allowedIpRanges: allowedIpRanges.length > 0 ? allowedIpRanges : null,
      expiresAt: key.expiresAt,
    });
    await ctx.runMutation(components.convexAuth.apiKeys.revokeApiKey, {
      apiKeyId,
      organizationId,
    });
    return { apiKeyId: newId, apiKey, keyPrefix, keyStart };
  },
});
