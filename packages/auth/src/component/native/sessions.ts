import { v, type Infer } from "convex/values";
import { getAllRows } from "../pagination.js";
import { getOneFrom } from "convex-helpers/server/relationships";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server.js";
import { base64urlToBytes } from "../../convex-runtime/native/password.js";
import type { Doc, Id } from "../_generated/dataModel.js";

const MAX_SESSIONS_PER_USER = 1000;

// Parallel requests can present the same refresh token (e.g. two SSR handlers
// holding the same cookie). Within this window a just-rotated token converges
// on a new sibling pair instead of being treated as replay. Bounded by
// MAX_GRACE_REDEMPTIONS per predecessor and MAX_FAMILY_LIVE_SESSIONS so a
// stolen predecessor can only ever yield a small number of live sessions.
const ROTATION_GRACE_MS = 15_000;
const MAX_GRACE_REDEMPTIONS = 8;
const MAX_FAMILY_LIVE_SESSIONS = 10;
// Families can accumulate far more than one page of rotated-out rows, so the
// liveness scan is bounded well above the 1,000-row page size.
const MAX_FAMILY_SCAN_ROWS = 2000;

function identityIdFromSessionToken(token: string): Id<"auth_identities"> | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return undefined;
  }
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64urlToBytes(parts[1]))) as {
      identityId?: unknown;
    };
    return typeof payload.identityId === "string"
      ? (payload.identityId as Id<"auth_identities">)
      : undefined;
  } catch {
    return undefined;
  }
}

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
      // The token was already spent. If it was spent by a rotation inside the
      // grace window, a parallel request holding the same cookie is presenting
      // it — converge rather than killing the session family it just minted.
      if (refresh.rotatedAt !== undefined && now - refresh.rotatedAt <= ROTATION_GRACE_MS) {
        // Over the redemption cap: fail soft — an over-cap request is not
        // itself evidence of theft, but it is worth an audit trail.
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
      await revokeSessionFamily(ctx, refresh.familyId ?? refresh.sessionId, refresh.userId, now);
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

    // Resolve the identity the session was minted with: the session row
    // carries it, and sessions minted before the column existed carry it as a
    // JWT claim instead. Any provider's session (password, OAuth, passkey)
    // refreshes correctly. A session with neither cannot name its identity —
    // guessing a provider would bind the wrong one, so fail closed.
    const sessionIdentityId = session.identityId ?? identityIdFromSessionToken(session.token);
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
      ctx.db.patch(refresh._id, { revokedAt: now, rotatedAt: now, updatedAt: now }),
      ctx.db.patch(session._id, { revokedAt: now, updatedAt: now }),
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
      // A revoked token that was never rotated, or a rotation older than the
      // window, is a replay signature — fail closed on the family. A still-
      // live token presented here is caller error: no revocation, no mint.
      if (refresh.revokedAt !== undefined) {
        await revokeSessionFamily(ctx, refresh.familyId ?? refresh.sessionId, refresh.userId, now);
      }
      return null;
    }
    const familyId = refresh.familyId ?? refresh.sessionId;
    if ((refresh.graceRedemptions ?? 0) >= MAX_GRACE_REDEMPTIONS) {
      // Fail soft: the cap bounds how many sessions a stolen predecessor can
      // yield, but an over-cap request is not itself evidence of theft.
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

    // Grace must die with the family: sign-out, password reset, or reuse
    // detection during the window leaves the predecessor's rotatedAt fresh
    // while every family member is dead. Require at least one live session —
    // the pair the winning rotation minted — before minting a sibling, and
    // bound live family membership so bursts cannot compound generation over
    // generation.
    const familySessions = await getAllRows(ctx, {
      table: "authSessions",
      index: "by_family",
      startIndexKey: [familyId],
      endIndexKey: [familyId],
      absoluteMaxRows: MAX_FAMILY_SCAN_ROWS,
    });
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

    // Same resolution as rotateSession — the converged row feeds the next
    // rotation, so an absent or foreign identity here would stick. Resolve
    // the predecessor's column, then its JWT claim, verify the identity
    // belongs to this user, and fail closed rather than mint an identity-
    // less sibling.
    const sessionIdentityId =
      session?.identityId ?? (session ? identityIdFromSessionToken(session.token) : undefined);
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

    await ctx.db.patch(refresh._id, {
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
    await Promise.all(expired.map((session) => ctx.db.delete(session._id)));
    return expired.length;
  },
});
