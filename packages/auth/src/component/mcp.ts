import {
  createMcpOAuthDynamicClient,
  createMcpOAuthRefreshToken,
  createMcpOAuthRefreshTokenPolicy,
  createMcpOAuthStoredClientRecord,
  hashMcpOAuthRefreshToken,
  MCP_OAUTH_RETIRED_SIGNING_KEY_RETENTION_MS,
  redeemMcpOAuthRefreshToken,
  registerMcpOAuthClient,
  type McpOAuthClient,
  type McpOAuthRefreshTokenRecord,
  type McpOAuthStoredClientRecord,
} from "../mcp";
import { getPage } from "convex-helpers/server/pagination";
import { getOneFrom } from "convex-helpers/server/relationships";
import { mergedStream, stream } from "convex-helpers/server/stream";
import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel.js";
import { mutation, query } from "./_generated/server.js";
import schema from "./schema.js";

const MAX_RETAINED_SIGNING_KEYS = 256;

const clientValidator = v.object({
  clientId: v.string(),
  name: v.string(),
  redirectUris: v.array(v.string()),
  allowedScopes: v.array(v.string()),
  tokenEndpointAuthMethod: v.optional(v.literal("none")),
  pkceRequired: v.optional(v.boolean()),
  grantTypes: v.optional(v.array(v.string())),
  responseTypes: v.optional(v.array(v.string())),
  softwareId: v.optional(v.union(v.string(), v.null())),
  softwareVersion: v.optional(v.union(v.string(), v.null())),
});

/**
 * The issued authorization code as read back at token exchange. `expiresAt`
 * is included so the exchange validator can enforce the expiry the code was
 * issued with (`McpOAuthAuthorizationCodeRecord` requires it).
 */
const authorizationCodeResultValidator = v.union(
  v.null(),
  v.object({
    clientId: v.string(),
    subjectId: v.string(),
    organizationId: v.string(),
    scopes: v.array(v.string()),
    codeChallenge: v.string(),
    codeChallengeMethod: v.literal("S256"),
    audience: v.string(),
    resourceId: v.string(),
    expiresAt: v.number(),
  }),
);

const refreshTokenIssueResultValidator = v.object({
  refreshToken: v.string(),
  expiresAt: v.number(),
  inactivityExpiresAt: v.union(v.number(), v.null()),
});

const refreshTokenRedeemResultValidator = v.union(
  v.object({
    ok: v.literal(true),
    subjectId: v.string(),
    organizationId: v.string(),
    audience: v.string(),
    resourceId: v.string(),
    scopes: v.array(v.string()),
    refreshToken: v.string(),
    expiresAt: v.number(),
    inactivityExpiresAt: v.union(v.number(), v.null()),
  }),
  v.object({
    ok: v.literal(false),
    status: v.number(),
    body: v.object({
      error: v.string(),
      error_description: v.optional(v.string()),
    }),
    reason: v.string(),
    familyRevocation: v.optional(
      v.object({
        familyId: v.string(),
        reason: v.string(),
        revokedAt: v.number(),
      }),
    ),
  }),
);

const signingKeyStatusValidator = v.union(v.literal("active"), v.literal("retired"));

const storedClientValidator = v.union(
  v.null(),
  v.object({
    clientId: v.string(),
    name: v.string(),
    redirectUris: v.array(v.string()),
    allowedScopes: v.array(v.string()),
    tokenEndpointAuthMethod: v.literal("none"),
    pkceRequired: v.boolean(),
    grantTypes: v.array(v.string()),
    responseTypes: v.array(v.string()),
    softwareId: v.union(v.string(), v.null()),
    softwareVersion: v.union(v.string(), v.null()),
  }),
);

const signingKeyRecordValidator = v.object({
  keyId: v.string(),
  algorithm: v.literal("ES256"),
  publicJwkJson: v.string(),
  privateJwkJson: v.string(),
});

const listedSigningKeyValidator = v.object({
  keyId: v.string(),
  algorithm: v.literal("ES256"),
  publicJwkJson: v.string(),
  privateJwkJson: v.string(),
  status: signingKeyStatusValidator,
  retiredAt: v.union(v.number(), v.null()),
  updatedAt: v.number(),
});

const MCP_OAUTH_REFRESH_TOKEN_POLICY = createMcpOAuthRefreshTokenPolicy({
  absoluteLifetimeMs: 30 * 24 * 60 * 60 * 1000,
  inactivityLifetimeMs: 7 * 24 * 60 * 60 * 1000,
});

type StoredMcpOAuthClientDoc = Omit<McpOAuthStoredClientRecord, "tokenEndpointAuthMethod"> & {
  tokenEndpointAuthMethod: "none";
};

type StoredMcpOAuthRefreshTokenDoc = Omit<
  McpOAuthRefreshTokenRecord,
  | "parentTokenId"
  | "scopes"
  | "inactivityExpiresAt"
  | "consumedAt"
  | "revokedAt"
  | "replacedByTokenId"
> & {
  tokenHash: string;
  parentTokenId?: string;
  scopes: string[];
  inactivityExpiresAt?: number;
  consumedAt?: number;
  revokedAt?: number;
  replacedByTokenId?: string;
  createdAt: number;
  updatedAt: number;
};

type StoredMcpOAuthRefreshTokenRow = StoredMcpOAuthRefreshTokenDoc & {
  _id: Id<"mcp_oauth_refresh_tokens">;
};

function toStoredMcpOAuthClientDoc(record: McpOAuthStoredClientRecord): StoredMcpOAuthClientDoc {
  return {
    ...record,
    tokenEndpointAuthMethod: "none",
  };
}

function toStoredMcpOAuthRefreshTokenDoc(args: {
  record: McpOAuthRefreshTokenRecord;
  tokenHash: string;
  now: number;
}): StoredMcpOAuthRefreshTokenDoc {
  return {
    tokenHash: args.tokenHash,
    tokenId: args.record.tokenId,
    familyId: args.record.familyId,
    parentTokenId: args.record.parentTokenId ?? undefined,
    clientId: args.record.clientId,
    subjectId: args.record.subjectId,
    organizationId: args.record.organizationId,
    scopes: [...args.record.scopes],
    audience: args.record.audience,
    resourceId: args.record.resourceId,
    issuedAt: args.record.issuedAt,
    expiresAt: args.record.expiresAt,
    inactivityExpiresAt: args.record.inactivityExpiresAt ?? undefined,
    consumedAt: args.record.consumedAt ?? undefined,
    revokedAt: args.record.revokedAt ?? undefined,
    replacedByTokenId: args.record.replacedByTokenId ?? undefined,
    createdAt: args.now,
    updatedAt: args.now,
  };
}

function toMcpOAuthRefreshTokenRecord(
  doc: StoredMcpOAuthRefreshTokenDoc,
): McpOAuthRefreshTokenRecord {
  return {
    tokenId: doc.tokenId,
    familyId: doc.familyId,
    parentTokenId: doc.parentTokenId ?? null,
    clientId: doc.clientId,
    subjectId: doc.subjectId,
    organizationId: doc.organizationId,
    scopes: doc.scopes,
    audience: doc.audience,
    resourceId: doc.resourceId,
    issuedAt: doc.issuedAt,
    expiresAt: doc.expiresAt,
    inactivityExpiresAt: doc.inactivityExpiresAt ?? null,
    consumedAt: doc.consumedAt ?? null,
    revokedAt: doc.revokedAt ?? null,
    replacedByTokenId: doc.replacedByTokenId ?? null,
  };
}

export const createAuthorizationCode = mutation({
  args: {
    code: v.string(),
    clientId: v.string(),
    redirectUri: v.string(),
    subjectId: v.string(),
    organizationId: v.string(),
    scopes: v.array(v.string()),
    codeChallenge: v.string(),
    codeChallengeMethod: v.literal("S256"),
    state: v.optional(v.string()),
    audience: v.string(),
    resourceId: v.string(),
    expiresAt: v.number(),
  },
  returns: v.object({ code: v.string() }),
  handler: async (ctx, args) => {
    await ctx.db.insert("mcp_oauth_authorization_codes", {
      code: args.code,
      clientId: args.clientId,
      redirectUri: args.redirectUri,
      subjectId: args.subjectId,
      organizationId: args.organizationId,
      scopes: [...args.scopes],
      codeChallenge: args.codeChallenge,
      codeChallengeMethod: args.codeChallengeMethod,
      state: args.state,
      audience: args.audience,
      resourceId: args.resourceId,
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    });
    return { code: args.code };
  },
});

export const consumeAuthorizationCode = mutation({
  args: {
    code: v.string(),
    clientId: v.string(),
    redirectUri: v.string(),
  },
  returns: authorizationCodeResultValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const doc = await getOneFrom(
      ctx.db,
      "mcp_oauth_authorization_codes",
      "by_code",
      args.code,
      "code",
    );

    if (doc === null) {
      return null;
    }

    if (doc.clientId !== args.clientId || doc.redirectUri !== args.redirectUri) {
      return null;
    }

    if (doc.expiresAt <= now || doc.consumedAt !== undefined) {
      return null;
    }

    await ctx.db.patch("mcp_oauth_authorization_codes", doc._id, {
      consumedAt: now,
    });
    return {
      clientId: doc.clientId,
      subjectId: doc.subjectId,
      organizationId: doc.organizationId,
      scopes: doc.scopes,
      codeChallenge: doc.codeChallenge,
      codeChallengeMethod: doc.codeChallengeMethod,
      audience: doc.audience,
      resourceId: doc.resourceId,
      expiresAt: doc.expiresAt,
    };
  },
});

export const resolveClient = query({
  args: {
    clientId: v.string(),
  },
  returns: storedClientValidator,
  handler: async (ctx, { clientId }) => {
    const stored = (await getOneFrom(
      ctx.db,
      "mcp_oauth_clients",
      "by_client_id",
      clientId,
      "clientId",
    )) as StoredMcpOAuthClientDoc | null;
    if (stored === null) {
      return null;
    }
    return {
      clientId: stored.clientId,
      name: stored.name,
      redirectUris: stored.redirectUris,
      allowedScopes: stored.allowedScopes,
      tokenEndpointAuthMethod: stored.tokenEndpointAuthMethod,
      pkceRequired: stored.pkceRequired,
      grantTypes: stored.grantTypes,
      responseTypes: stored.responseTypes,
      softwareId: stored.softwareId ?? null,
      softwareVersion: stored.softwareVersion ?? null,
    };
  },
});

export const registerDynamicClient = mutation({
  args: {
    clientId: v.string(),
    clientName: v.string(),
    redirectUris: v.array(v.string()),
    scope: v.optional(v.string()),
    softwareId: v.optional(v.union(v.string(), v.null())),
    softwareVersion: v.optional(v.union(v.string(), v.null())),
    supportedScopes: v.array(v.string()),
  },
  returns: v.id("mcp_oauth_clients"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const registeredClient = registerMcpOAuthClient(
      {
        clientName: args.clientName,
        redirectUris: args.redirectUris,
        scope: args.scope,
        softwareId: args.softwareId,
        softwareVersion: args.softwareVersion,
        tokenEndpointAuthMethod: "none",
      },
      {
        supportedScopes: args.supportedScopes,
      },
      {
        clientId: args.clientId,
      },
    );
    const storedClient = toStoredMcpOAuthClientDoc(
      createMcpOAuthStoredClientRecord(registeredClient, now),
    );

    const existing = await getOneFrom(
      ctx.db,
      "mcp_oauth_clients",
      "by_client_id",
      args.clientId,
      "clientId",
    );

    if (existing !== null) {
      await ctx.db.patch("mcp_oauth_clients", existing._id, {
        name: storedClient.name,
        redirectUris: storedClient.redirectUris,
        allowedScopes: storedClient.allowedScopes,
        tokenEndpointAuthMethod: storedClient.tokenEndpointAuthMethod,
        pkceRequired: storedClient.pkceRequired,
        grantTypes: storedClient.grantTypes,
        responseTypes: storedClient.responseTypes,
        softwareId: storedClient.softwareId,
        softwareVersion: storedClient.softwareVersion,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("mcp_oauth_clients", storedClient);
  },
});

export const createDynamicClient = mutation({
  args: {
    clientName: v.string(),
    redirectUris: v.array(v.string()),
    scope: v.optional(v.string()),
    tokenEndpointAuthMethod: v.optional(v.string()),
    grantTypes: v.optional(v.array(v.string())),
    responseTypes: v.optional(v.array(v.string())),
    softwareId: v.optional(v.union(v.string(), v.null())),
    softwareVersion: v.optional(v.union(v.string(), v.null())),
    clientIdPrefix: v.optional(v.string()),
    supportedScopes: v.array(v.string()),
  },
  returns: v.object({
    clientId: v.string(),
    clientIdIssuedAt: v.number(),
    name: v.string(),
    redirectUris: v.array(v.string()),
    allowedScopes: v.array(v.string()),
    tokenEndpointAuthMethod: v.optional(v.literal("none")),
    pkceRequired: v.optional(v.boolean()),
    grantTypes: v.optional(v.array(v.string())),
    responseTypes: v.optional(v.array(v.string())),
    softwareId: v.union(v.string(), v.null()),
    softwareVersion: v.union(v.string(), v.null()),
    registrationClientUri: v.union(v.string(), v.null()),
    registrationAccessToken: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const created = await createMcpOAuthDynamicClient({
      input: {
        clientName: args.clientName,
        redirectUris: args.redirectUris,
        scope: args.scope,
        tokenEndpointAuthMethod: "none",
        grantTypes: args.grantTypes,
        responseTypes: args.responseTypes,
        softwareId: args.softwareId,
        softwareVersion: args.softwareVersion,
      },
      policy: {
        supportedScopes: args.supportedScopes,
      },
      clientId: `${args.clientIdPrefix ?? "vtx-mcp"}-${crypto.randomUUID()}`,
      persist: async (record) => {
        return await ctx.db.insert("mcp_oauth_clients", toStoredMcpOAuthClientDoc(record));
      },
    });

    return {
      clientId: created.client.clientId,
      clientIdIssuedAt: created.clientIdIssuedAt,
      name: created.client.name,
      redirectUris: [...created.client.redirectUris],
      allowedScopes: [...created.client.allowedScopes],
      tokenEndpointAuthMethod: "none" as const,
      pkceRequired: created.client.pkceRequired,
      grantTypes: created.client.grantTypes ? [...created.client.grantTypes] : undefined,
      responseTypes: created.client.responseTypes ? [...created.client.responseTypes] : undefined,
      softwareId: created.client.softwareId ?? null,
      softwareVersion: created.client.softwareVersion ?? null,
      registrationClientUri: created.client.registrationClientUri ?? null,
      registrationAccessToken: created.client.registrationAccessToken ?? null,
    };
  },
});

export const issueRefreshToken = mutation({
  args: {
    clientId: v.string(),
    subjectId: v.string(),
    organizationId: v.string(),
    scopes: v.array(v.string()),
    audience: v.string(),
    resourceId: v.string(),
  },
  returns: refreshTokenIssueResultValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const issued = createMcpOAuthRefreshToken({
      clientId: args.clientId,
      subjectId: args.subjectId,
      organizationId: args.organizationId,
      scopes: args.scopes,
      audience: args.audience,
      resourceId: args.resourceId,
      policy: MCP_OAUTH_REFRESH_TOKEN_POLICY,
      now,
    });
    const { tokenHash } = await hashMcpOAuthRefreshToken(issued.refreshToken);

    await ctx.db.insert(
      "mcp_oauth_refresh_tokens",
      toStoredMcpOAuthRefreshTokenDoc({
        record: issued.record,
        tokenHash,
        now,
      }),
    );

    return {
      refreshToken: issued.refreshToken,
      expiresAt: issued.record.expiresAt,
      inactivityExpiresAt: issued.record.inactivityExpiresAt ?? null,
    };
  },
});

export const redeemRefreshToken = mutation({
  args: {
    client: clientValidator,
    refreshToken: v.string(),
    requestedScopes: v.optional(v.array(v.string())),
  },
  returns: refreshTokenRedeemResultValidator,
  handler: async (ctx, args) => {
    const client: McpOAuthClient = {
      clientId: args.client.clientId,
      name: args.client.name,
      redirectUris: args.client.redirectUris,
      allowedScopes: args.client.allowedScopes,
      tokenEndpointAuthMethod: args.client.tokenEndpointAuthMethod,
      pkceRequired: args.client.pkceRequired,
      grantTypes: args.client.grantTypes,
      responseTypes: args.client.responseTypes,
      softwareId: args.client.softwareId ?? null,
      softwareVersion: args.client.softwareVersion ?? null,
    };

    const now = Date.now();
    const redeemed = await redeemMcpOAuthRefreshToken({
      client,
      refreshToken: args.refreshToken,
      requestedScopes: args.requestedScopes,
      policy: MCP_OAUTH_REFRESH_TOKEN_POLICY,
      now,
      storage: {
        findForRefreshToken: async ({ refreshToken, clientId }) => {
          const { tokenHash } = await hashMcpOAuthRefreshToken(refreshToken);
          const doc = (await getOneFrom(
            ctx.db,
            "mcp_oauth_refresh_tokens",
            "by_token_hash",
            tokenHash,
            "tokenHash",
          )) as StoredMcpOAuthRefreshTokenDoc | null;
          if (doc === null || doc.clientId !== clientId) {
            return null;
          }
          const familyRevocation = await getOneFrom(
            ctx.db,
            "mcp_oauth_revoked_families",
            "by_family_id",
            doc.familyId,
            "familyId",
          );
          const record = toMcpOAuthRefreshTokenRecord(doc);
          return familyRevocation === null
            ? record
            : { ...record, revokedAt: familyRevocation.revokedAt };
        },
        rotate: async (input) => {
          const currentHash = await hashMcpOAuthRefreshToken(input.currentRefreshToken);
          const doc = (await getOneFrom(
            ctx.db,
            "mcp_oauth_refresh_tokens",
            "by_token_hash",
            currentHash.tokenHash,
            "tokenHash",
          )) as StoredMcpOAuthRefreshTokenRow | null;
          if (doc === null || doc.clientId !== input.currentRecord.clientId) {
            return { ok: false as const, reason: "not_found" as const };
          }
          const familyRevocation = await getOneFrom(
            ctx.db,
            "mcp_oauth_revoked_families",
            "by_family_id",
            doc.familyId,
            "familyId",
          );
          if (
            familyRevocation !== null ||
            doc.consumedAt !== undefined ||
            doc.revokedAt !== undefined ||
            doc.replacedByTokenId !== undefined
          ) {
            return { ok: false as const, reason: "conflict" as const };
          }

          const nextHash = await hashMcpOAuthRefreshToken(input.nextRefreshToken);
          await ctx.db.insert(
            "mcp_oauth_refresh_tokens",
            toStoredMcpOAuthRefreshTokenDoc({
              record: input.nextRecord,
              tokenHash: nextHash.tokenHash,
              now,
            }),
          );
          await ctx.db.patch("mcp_oauth_refresh_tokens", doc._id, {
            consumedAt: input.consumedRecordPatch.consumedAt,
            replacedByTokenId: input.consumedRecordPatch.replacedByTokenId,
            updatedAt: now,
          });

          return { ok: true as const };
        },
        revokeFamily: async (input) => {
          const existing = await getOneFrom(
            ctx.db,
            "mcp_oauth_revoked_families",
            "by_family_id",
            input.familyId,
            "familyId",
          );
          if (existing === null) {
            await ctx.db.insert("mcp_oauth_revoked_families", input);
          } else if (input.revokedAt < existing.revokedAt) {
            await ctx.db.patch("mcp_oauth_revoked_families", existing._id, {
              revokedAt: input.revokedAt,
              reason: input.reason,
            });
          }
        },
      },
    });

    if (!redeemed.ok) {
      return redeemed;
    }

    return {
      ok: true as const,
      subjectId: redeemed.record.subjectId,
      organizationId: redeemed.record.organizationId,
      audience: redeemed.record.audience,
      resourceId: redeemed.record.resourceId,
      scopes: [...redeemed.scopes],
      refreshToken: redeemed.rotation.refreshToken,
      expiresAt: redeemed.rotation.record.expiresAt,
      inactivityExpiresAt: redeemed.rotation.record.inactivityExpiresAt ?? null,
    };
  },
});

/**
 * Latest active signing key. Signing keys are global rather than per-tenant —
 * each distinct keyId has one row, and rotations retain old rows so in-flight
 * tokens can verify during the retirement window.
 */
export const getSigningKey = query({
  args: {},
  returns: v.union(v.null(), signingKeyRecordValidator),
  handler: async (ctx) => {
    const { page } = await getPage(ctx, {
      table: "mcp_oauth_signing_keys",
      index: "by_status_updated_at",
      startIndexKey: ["active"],
      endIndexKey: ["active"],
      order: "desc",
      absoluteMaxRows: 1,
      schema,
    });
    const latestActive = page[0] ?? null;
    if (latestActive === null) {
      return null;
    }
    return {
      keyId: latestActive.keyId,
      algorithm: latestActive.algorithm,
      publicJwkJson: latestActive.publicJwkJson,
      privateJwkJson: latestActive.privateJwkJson,
    };
  },
});

export const listSigningKeys = query({
  args: {
    includeRetired: v.optional(v.boolean()),
  },
  returns: v.array(listedSigningKeyValidator),
  handler: async (ctx, args) => {
    const keys: Doc<"mcp_oauth_signing_keys">[] = [];
    if (args.includeRetired) {
      const activeKeys = stream(ctx.db, schema)
        .query("mcp_oauth_signing_keys")
        .withIndex("by_status_retired_at", (q) => q.eq("status", "active"))
        .order("desc");
      keys.push(
        ...(await mergedStream(
          [
            activeKeys,
            stream(ctx.db, schema)
              .query("mcp_oauth_signing_keys")
              .withIndex("by_status_retired_at", (q) =>
                q
                  .eq("status", "retired")
                  .gte("retiredAt", Date.now() - MCP_OAUTH_RETIRED_SIGNING_KEY_RETENTION_MS),
              )
              .order("desc"),
          ],
          ["retiredAt", "_creationTime"],
        ).take(MAX_RETAINED_SIGNING_KEYS + 1)),
      );
    } else {
      for await (const key of ctx.db
        .query("mcp_oauth_signing_keys")
        .withIndex("by_status_retired_at", (q) => q.eq("status", "active"))
        .order("desc")) {
        keys.push(key);
        if (keys.length > MAX_RETAINED_SIGNING_KEYS) {
          break;
        }
      }
    }

    if (keys.length > MAX_RETAINED_SIGNING_KEYS) {
      throw new ConvexError({
        code: "MCP_SIGNING_KEY_LIMIT_EXCEEDED",
        message: "The retained MCP OAuth signing-key set exceeds the supported bound",
      });
    }

    return keys.map((key) => ({
      keyId: key.keyId,
      algorithm: key.algorithm,
      publicJwkJson: key.publicJwkJson,
      privateJwkJson: key.privateJwkJson,
      status: key.status,
      retiredAt: key.retiredAt ?? null,
      updatedAt: key.updatedAt,
    }));
  },
});

export const upsertSigningKey = mutation({
  args: signingKeyRecordValidator,
  returns: v.id("mcp_oauth_signing_keys"),
  handler: async (ctx, args) => {
    const existing = await getOneFrom(
      ctx.db,
      "mcp_oauth_signing_keys",
      "by_key_id",
      args.keyId,
      "keyId",
    );
    const now = Date.now();

    if (existing !== null) {
      await ctx.db.patch("mcp_oauth_signing_keys", existing._id, {
        algorithm: args.algorithm,
        publicJwkJson: args.publicJwkJson,
        privateJwkJson: args.privateJwkJson,
        status: "active",
        retiredAt: undefined,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("mcp_oauth_signing_keys", {
      ...args,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateSigningKeyStatus = mutation({
  args: {
    keyId: v.string(),
    status: signingKeyStatusValidator,
    retiredAt: v.optional(v.number()),
  },
  returns: v.id("mcp_oauth_signing_keys"),
  handler: async (ctx, args) => {
    const existing = await getOneFrom(
      ctx.db,
      "mcp_oauth_signing_keys",
      "by_key_id",
      args.keyId,
      "keyId",
    );
    if (existing === null) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Signing key not found",
      });
    }

    await ctx.db.patch("mcp_oauth_signing_keys", existing._id, {
      status: args.status,
      retiredAt: args.status === "retired" ? (args.retiredAt ?? Date.now()) : undefined,
      updatedAt: Date.now(),
    });

    return existing._id;
  },
});
