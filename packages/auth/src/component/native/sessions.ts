import { v, type Infer } from "convex/values";
import { getPage } from "convex-helpers/server/pagination";
import { getOneFrom } from "convex-helpers/server/relationships";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server.js";
import schema from "../schema.js";
import type { Doc, Id } from "../_generated/dataModel.js";

const MAX_SESSIONS_PER_USER = 1000;

async function getSessionsByUser(ctx: { db: QueryCtx["db"] }, userId: string) {
  const { page } = await getPage(ctx, {
    table: "authSessions",
    index: "by_user",
    startIndexKey: [userId],
    endIndexKey: [userId],
    absoluteMaxRows: MAX_SESSIONS_PER_USER,
    schema,
  });
  return page;
}

async function getIdentityByUserProviderIssuer(
  ctx: { db: QueryCtx["db"] },
  userId: string,
  provider: string,
  issuer: string,
) {
  const { page } = await getPage(ctx, {
    table: "auth_identities",
    index: "by_user_provider_issuer",
    startIndexKey: [userId, provider, issuer],
    endIndexKey: [userId, provider, issuer],
    absoluteMaxRows: 1,
    schema,
  });
  return page[0] ?? null;
}

const userReturnValidator = v.object({
  _id: v.id("users"),
  email: v.optional(v.string()),
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  emailVerified: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const rotateSessionResultValidator = v.union(
  v.null(),
  v.object({
    user: userReturnValidator,
    identityId: v.id("auth_identities"),
  }),
);

function toUserReturn(user: Doc<"users">): Infer<typeof userReturnValidator> {
  return {
    _id: user._id,
    email: user.email,
    name: user.name,
    image: user.image,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export const createSession = mutation({
  args: {
    sessionId: v.string(),
    familyId: v.optional(v.string()),
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("authSessions", {
      ...args,
      familyId: args.familyId ?? args.sessionId,
      ipAddress: undefined,
      userAgent: undefined,
      revokedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createSessionAndRefreshToken = mutation({
  args: {
    sessionId: v.string(),
    familyId: v.optional(v.string()),
    userId: v.id("users"),
    token: v.string(),
    sessionExpiresAt: v.number(),
    refreshTokenHash: v.string(),
    refreshTokenExpiresAt: v.number(),
  },
  returns: v.id("authSessions"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const familyId = args.familyId ?? args.sessionId;
    await ctx.db.insert("authRefreshTokens", {
      tokenHash: args.refreshTokenHash,
      sessionId: args.sessionId,
      familyId,
      userId: args.userId,
      expiresAt: args.refreshTokenExpiresAt,
      revokedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.insert("authSessions", {
      sessionId: args.sessionId,
      familyId,
      userId: args.userId,
      token: args.token,
      expiresAt: args.sessionExpiresAt,
      ipAddress: undefined,
      userAgent: undefined,
      revokedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const revokeSession = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const session = await getOneFrom(
      ctx.db,
      "authSessions",
      "by_session_id",
      args.sessionId,
      "sessionId",
    );
    if (session) {
      await ctx.db.patch(session._id, { revokedAt: Date.now() });
    }
    return session?._id ?? null;
  },
});

export const listSessionsByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await getSessionsByUser(ctx, args.userId);
  },
});

export const getSessionByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    return await getOneFrom(ctx.db, "authSessions", "by_token", args.token, "token");
  },
});

export const getSessionBySessionId = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await getOneFrom(ctx.db, "authSessions", "by_session_id", args.sessionId, "sessionId");
  },
});

export const revokeSessionsForUser = mutation({
  args: {
    userId: v.id("users"),
    excludeSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const sessions = await getSessionsByUser(ctx, args.userId);

    const active = sessions.filter(
      (session) => session.revokedAt === undefined && session.expiresAt > now,
    );

    let revoked = 0;
    for (const session of active) {
      if (args.excludeSessionId && session.sessionId === args.excludeSessionId) {
        continue;
      }
      await ctx.db.patch(session._id, { revokedAt: now, updatedAt: now });
      revoked++;
    }
    return revoked;
  },
});

const MAX_FAMILY_MEMBERS = 1000;

async function getRefreshTokensBySession(ctx: { db: QueryCtx["db"] }, sessionId: string) {
  const { page } = await getPage(ctx, {
    table: "authRefreshTokens",
    index: "by_session",
    startIndexKey: [sessionId],
    endIndexKey: [sessionId],
    absoluteMaxRows: MAX_FAMILY_MEMBERS,
    schema,
  });
  return page;
}

async function getRefreshTokensByFamily(ctx: { db: QueryCtx["db"] }, familyId: string) {
  const { page } = await getPage(ctx, {
    table: "authRefreshTokens",
    index: "by_family",
    startIndexKey: [familyId],
    endIndexKey: [familyId],
    absoluteMaxRows: MAX_FAMILY_MEMBERS,
    schema,
  });
  return page;
}

async function getSessionsByFamily(ctx: { db: QueryCtx["db"] }, familyId: string) {
  const { page } = await getPage(ctx, {
    table: "authSessions",
    index: "by_family",
    startIndexKey: [familyId],
    endIndexKey: [familyId],
    absoluteMaxRows: MAX_FAMILY_MEMBERS,
    schema,
  });
  return page;
}

// Presentation of an already-rotated refresh token means the token was
// replayed — either by an attacker holding a stolen token or by a client
// racing itself. Fail closed: revoke every session and refresh token in the
// family and record an audit event.
async function revokeSessionFamily(
  ctx: { db: MutationCtx["db"] },
  familyId: string,
  userId: string,
  now: number,
) {
  // Rows created before family tracking carry no familyId; they are reachable
  // through the spent token's own sessionId, which doubles as its familyId.
  const [familyTokens, sessionTokens, familySessions] = await Promise.all([
    getRefreshTokensByFamily(ctx, familyId),
    getRefreshTokensBySession(ctx, familyId),
    getSessionsByFamily(ctx, familyId),
  ]);
  const legacySession = await getOneFrom(
    ctx.db,
    "authSessions",
    "by_session_id",
    familyId,
    "sessionId",
  );

  const seen = new Set<string>();
  for (const token of [...familyTokens, ...sessionTokens]) {
    if (seen.has(token._id)) {
      continue;
    }
    seen.add(token._id);
    if (!token.revokedAt) {
      await ctx.db.patch(token._id, { revokedAt: now, updatedAt: now });
    }
  }
  for (const session of familySessions) {
    seen.add(session._id);
    if (!session.revokedAt) {
      await ctx.db.patch(session._id, { revokedAt: now, updatedAt: now });
    }
  }
  if (legacySession && !seen.has(legacySession._id) && !legacySession.revokedAt) {
    await ctx.db.patch(legacySession._id, { revokedAt: now, updatedAt: now });
  }

  await ctx.db.insert("auth_audit_events", {
    actorUserId: userId as Id<"users">,
    actorType: "system",
    eventType: "refresh_token_reuse",
    targetType: "session",
    targetId: familyId,
    organizationId: undefined,
    metadataJson: undefined,
    createdAt: now,
  });
}

export const rotateSession = mutation({
  args: {
    oldRefreshTokenHash: v.string(),
    newSessionId: v.string(),
    newSessionToken: v.string(),
    newSessionExpiresAt: v.number(),
    newSessionIpAddress: v.optional(v.string()),
    newSessionUserAgent: v.optional(v.string()),
    newRefreshTokenHash: v.string(),
    newRefreshTokenExpiresAt: v.number(),
    provider: v.string(),
    issuer: v.string(),
  },
  returns: rotateSessionResultValidator,
  handler: async (ctx, args) => {
    const now = Date.now();

    const refresh = await getOneFrom(
      ctx.db,
      "authRefreshTokens",
      "by_token_hash",
      args.oldRefreshTokenHash,
      "tokenHash",
    );
    if (!refresh || refresh.expiresAt <= now) {
      return null;
    }
    if (refresh.revokedAt !== undefined) {
      await revokeSessionFamily(
        ctx,
        refresh.familyId ?? refresh.sessionId,
        refresh.userId,
        now,
      );
      return null;
    }

    const session = await getOneFrom(
      ctx.db,
      "authSessions",
      "by_session_id",
      refresh.sessionId,
      "sessionId",
    );
    if (!session || session.revokedAt || session.expiresAt <= now) {
      return null;
    }

    const user = await ctx.db.get("users", refresh.userId);
    if (!user) {
      return null;
    }

    const identity = await getIdentityByUserProviderIssuer(
      ctx,
      refresh.userId,
      args.provider,
      args.issuer,
    );
    if (!identity) {
      return null;
    }

    await Promise.all([
      ctx.db.patch(refresh._id, { revokedAt: now, updatedAt: now }),
      ctx.db.patch(session._id, { revokedAt: now, updatedAt: now }),
    ]);

    const familyId = refresh.familyId ?? refresh.sessionId;

    await ctx.db.insert("authSessions", {
      sessionId: args.newSessionId,
      familyId,
      userId: refresh.userId,
      token: args.newSessionToken,
      expiresAt: args.newSessionExpiresAt,
      ipAddress: args.newSessionIpAddress,
      userAgent: args.newSessionUserAgent,
      revokedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("authRefreshTokens", {
      tokenHash: args.newRefreshTokenHash,
      sessionId: args.newSessionId,
      familyId,
      userId: refresh.userId,
      expiresAt: args.newRefreshTokenExpiresAt,
      revokedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });

    return { user: toUserReturn(user), identityId: identity._id };
  },
});

const CLEANUP_BATCH_SIZE = 250;

export const cleanupExpiredSessions = mutation({
  args: { batchSize: v.optional(v.number()), before: v.optional(v.number()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = args.before ?? Date.now();
    const batchSize = args.batchSize ?? CLEANUP_BATCH_SIZE;
    const expired = await ctx.db
      .query("authSessions")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", now))
      .take(batchSize);
    await Promise.all(expired.map((session) => ctx.db.delete(session._id)));
    return expired.length;
  },
});
