import { v, type Infer } from "convex/values";
import { getAllRows } from "../pagination.js";
import { getOneFrom } from "convex-helpers/server/relationships";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server.js";
import type { Doc, Id } from "../_generated/dataModel.js";

const MAX_SESSIONS_PER_USER = 1000;

const ROTATION_GRACE_MS = 15_000;
const MAX_GRACE_REDEMPTIONS = 8;
const MAX_FAMILY_LIVE_SESSIONS = 10;
const MAX_FAMILY_SCAN_ROWS = 2000;

async function getSessionsByUser(ctx: { db: QueryCtx["db"] }, userId: string) {
  return await getAllRows(ctx, {
    table: "authSessions",
    index: "by_user",
    startIndexKey: [userId],
    endIndexKey: [userId],
    absoluteMaxRows: MAX_SESSIONS_PER_USER,
  });
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
  v.literal("converge"),
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
    identityId: v.optional(v.id("auth_identities")),
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
    identityId: v.id("auth_identities"),
    token: v.string(),
    credentialId: v.optional(v.string()),
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
      identityId: args.identityId,
      token: args.token,
      credentialId: args.credentialId,
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
      await ctx.db.patch("authSessions", session._id, { revokedAt: Date.now() });
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
    excludeFamilyId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const sessions = await getSessionsByUser(ctx, args.userId);

    const isExcluded = (sessionId: string, familyId?: string) =>
      sessionId === args.excludeSessionId ||
      (args.excludeFamilyId !== undefined && (familyId ?? sessionId) === args.excludeFamilyId);

    const active = sessions.filter(
      (session) => session.revokedAt === undefined && session.expiresAt > now,
    );

    let revoked = 0;
    for (const session of active) {
      if (isExcluded(session.sessionId, session.familyId)) {
        continue;
      }
      await ctx.db.patch("authSessions", session._id, { revokedAt: now, updatedAt: now });
      revoked++;
    }

    for await (const token of ctx.db
      .query("authRefreshTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))) {
      if (token.revokedAt === undefined && !isExcluded(token.sessionId, token.familyId)) {
        await ctx.db.patch("authRefreshTokens", token._id, { revokedAt: now, updatedAt: now });
      }
    }
    return revoked;
  },
});

const MAX_FAMILY_MEMBERS = 1000;

async function getRefreshTokensBySession(ctx: { db: QueryCtx["db"] }, sessionId: string) {
  return await getAllRows(ctx, {
    table: "authRefreshTokens",
    index: "by_session",
    startIndexKey: [sessionId],
    endIndexKey: [sessionId],
    absoluteMaxRows: MAX_FAMILY_MEMBERS,
  });
}

async function getRefreshTokensByFamily(ctx: { db: QueryCtx["db"] }, familyId: string) {
  return await getAllRows(ctx, {
    table: "authRefreshTokens",
    index: "by_family",
    startIndexKey: [familyId],
    endIndexKey: [familyId],
    absoluteMaxRows: MAX_FAMILY_MEMBERS,
  });
}

async function getSessionsByFamily(ctx: { db: QueryCtx["db"] }, familyId: string) {
  return await getAllRows(ctx, {
    table: "authSessions",
    index: "by_family",
    startIndexKey: [familyId],
    endIndexKey: [familyId],
    absoluteMaxRows: MAX_FAMILY_MEMBERS,
  });
}

export async function revokeSessionFamily(
  ctx: { db: MutationCtx["db"] },
  familyId: string,
  userId: string,
  now: number,
  auditEventType: string | null = "refresh_token_reuse",
) {
  const [familyTokens, sessionTokens, familySessions] = await Promise.all([
    getRefreshTokensByFamily(ctx, familyId),
    getRefreshTokensBySession(ctx, familyId),
    getSessionsByFamily(ctx, familyId),
  ]);

  const seen = new Set<string>();
  for (const token of [...familyTokens, ...sessionTokens]) {
    if (seen.has(token._id)) {
      continue;
    }
    seen.add(token._id);
    if (!token.revokedAt) {
      await ctx.db.patch("authRefreshTokens", token._id, { revokedAt: now, updatedAt: now });
    }
  }
  for (const session of familySessions) {
    if (!session.revokedAt) {
      await ctx.db.patch("authSessions", session._id, { revokedAt: now, updatedAt: now });
    }
  }

  if (auditEventType !== null) {
    await ctx.db.insert("auth_audit_events", {
      actorUserId: userId as Id<"users">,
      actorType: "system",
      eventType: auditEventType,
      targetType: "session",
      targetId: familyId,
      organizationId: undefined,
      metadataJson: undefined,
      createdAt: now,
    });
  }
}

export const revokeSessionFamilyBySession = mutation({
  args: { sessionId: v.string(), auditEventType: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const session = await getOneFrom(
      ctx.db,
      "authSessions",
      "by_session_id",
      args.sessionId,
      "sessionId",
    );
    if (!session) {
      return null;
    }
    await revokeSessionFamily(
      ctx,
      session.familyId ?? args.sessionId,
      String(session.userId),
      Date.now(),
      args.auditEventType ?? "session.sign_out",
    );
    return session._id;
  },
});

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
      if (refresh.rotatedAt !== undefined && now - refresh.rotatedAt <= ROTATION_GRACE_MS) {
        if ((refresh.graceRedemptions ?? 0) >= MAX_GRACE_REDEMPTIONS) {
          await ctx.db.insert("auth_audit_events", {
            actorUserId: refresh.userId,
            actorType: "system",
            eventType: "refresh_token_grace_exhausted",
            targetType: "session",
            targetId: refresh.familyId ?? refresh.sessionId,
            organizationId: undefined,
            metadataJson: undefined,
            createdAt: now,
          });
          return null;
        }
        return "converge";
      }
      if (refresh.rotatedAt !== undefined) {
        await revokeSessionFamily(ctx, refresh.familyId ?? refresh.sessionId, refresh.userId, now);
      }
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

    const sessionIdentityId = session.identityId;
    let identity: Doc<"auth_identities"> | null = null;
    if (sessionIdentityId) {
      try {
        identity = await ctx.db.get("auth_identities", sessionIdentityId);
      } catch {
        identity = null;
      }
    }
    if (!identity || identity.userId !== refresh.userId) {
      return null;
    }

    await Promise.all([
      ctx.db.patch("authRefreshTokens", refresh._id, {
        revokedAt: now,
        rotatedAt: now,
        updatedAt: now,
      }),
      ctx.db.patch("authSessions", session._id, { revokedAt: now, updatedAt: now }),
    ]);

    const familyId = refresh.familyId ?? refresh.sessionId;

    await ctx.db.insert("authSessions", {
      sessionId: args.newSessionId,
      familyId,
      userId: refresh.userId,
      identityId: identity._id,
      token: args.newSessionToken,
      expiresAt: args.newSessionExpiresAt,
      ipAddress: args.newSessionIpAddress,
      userAgent: args.newSessionUserAgent,
      credentialId: session.credentialId,
      impersonatedBy: session.impersonatedBy,
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

/**
 * Mints a sibling session + refresh token in the same family when a
 * just-rotated token is presented within the grace window — the parallel-
 * request case `rotateSession` reports as "converge". Re-validates the grace
 * conditions inside the mutation so concurrent presentations stay serialized.
 */
export const convergeSession = mutation({
  args: {
    predecessorRefreshTokenHash: v.string(),
    newSessionId: v.string(),
    newSessionToken: v.string(),
    newSessionExpiresAt: v.number(),
    newSessionIpAddress: v.optional(v.string()),
    newSessionUserAgent: v.optional(v.string()),
    newRefreshTokenHash: v.string(),
    newRefreshTokenExpiresAt: v.number(),
  },
  returns: v.union(v.null(), v.object({ user: userReturnValidator })),
  handler: async (ctx, args) => {
    const now = Date.now();
    const refresh = await getOneFrom(
      ctx.db,
      "authRefreshTokens",
      "by_token_hash",
      args.predecessorRefreshTokenHash,
      "tokenHash",
    );
    if (!refresh || refresh.expiresAt <= now) {
      return null;
    }
    if (
      refresh.revokedAt === undefined ||
      refresh.rotatedAt === undefined ||
      now - refresh.rotatedAt > ROTATION_GRACE_MS
    ) {
      if (refresh.rotatedAt !== undefined) {
        await revokeSessionFamily(ctx, refresh.familyId ?? refresh.sessionId, refresh.userId, now);
      }
      return null;
    }
    const familyId = refresh.familyId ?? refresh.sessionId;
    if ((refresh.graceRedemptions ?? 0) >= MAX_GRACE_REDEMPTIONS) {
      await ctx.db.insert("auth_audit_events", {
        actorUserId: refresh.userId,
        actorType: "system",
        eventType: "refresh_token_grace_exhausted",
        targetType: "session",
        targetId: familyId,
        organizationId: undefined,
        metadataJson: undefined,
        createdAt: now,
      });
      return null;
    }

    const familySessions = await ctx.db
      .query("authSessions")
      .withIndex("by_family", (q) => q.eq("familyId", familyId))
      .take(MAX_FAMILY_SCAN_ROWS + 1);
    if (familySessions.length > MAX_FAMILY_SCAN_ROWS) {
      await ctx.db.insert("auth_audit_events", {
        actorUserId: refresh.userId,
        actorType: "system",
        eventType: "refresh_token_grace_exhausted",
        targetType: "session",
        targetId: familyId,
        organizationId: undefined,
        metadataJson: undefined,
        createdAt: now,
      });
      return null;
    }
    const liveCount = familySessions.filter(
      (s) => s.revokedAt === undefined && s.expiresAt > now,
    ).length;
    if (liveCount === 0) {
      return null;
    }
    if (liveCount >= MAX_FAMILY_LIVE_SESSIONS) {
      await ctx.db.insert("auth_audit_events", {
        actorUserId: refresh.userId,
        actorType: "system",
        eventType: "refresh_token_grace_exhausted",
        targetType: "session",
        targetId: familyId,
        organizationId: undefined,
        metadataJson: undefined,
        createdAt: now,
      });
      return null;
    }

    const session = await getOneFrom(
      ctx.db,
      "authSessions",
      "by_session_id",
      refresh.sessionId,
      "sessionId",
    );
    const user = await ctx.db.get("users", refresh.userId);
    if (!user) {
      return null;
    }

    const sessionIdentityId = session?.identityId;
    let identity: Doc<"auth_identities"> | null = null;
    if (sessionIdentityId) {
      try {
        identity = await ctx.db.get("auth_identities", sessionIdentityId);
      } catch {
        identity = null;
      }
    }
    if (!identity || identity.userId !== refresh.userId) {
      return null;
    }

    await ctx.db.patch("authRefreshTokens", refresh._id, {
      graceRedemptions: (refresh.graceRedemptions ?? 0) + 1,
      updatedAt: now,
    });
    await ctx.db.insert("authSessions", {
      sessionId: args.newSessionId,
      familyId,
      userId: refresh.userId,
      identityId: identity._id,
      token: args.newSessionToken,
      expiresAt: args.newSessionExpiresAt,
      ipAddress: args.newSessionIpAddress,
      userAgent: args.newSessionUserAgent,
      credentialId: session?.credentialId,
      impersonatedBy: session?.impersonatedBy,
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

    await ctx.db.insert("auth_audit_events", {
      actorUserId: refresh.userId,
      actorType: "system",
      eventType: "refresh_token_converged",
      targetType: "session",
      targetId: familyId,
      organizationId: undefined,
      metadataJson: undefined,
      createdAt: now,
    });

    return { user: toUserReturn(user) };
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
    await Promise.all(expired.map((session) => ctx.db.delete("authSessions", session._id)));
    return expired.length;
  },
});
