import type { GenericActionCtx, GenericDataModel } from "convex/server";
import { mintToken } from "./jwt.js";
import { generateVerificationToken, hashToken } from "./tokens.js";
import type { NativeAuthSession, NativeEmailAndPasswordComponentHandle } from "./types.js";
import { toNativeAuthUser } from "./types.js";

const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function handleUpdateSession<DataModel extends GenericDataModel>(
  ctx: GenericActionCtx<DataModel>,
  component: NativeEmailAndPasswordComponentHandle,
  refreshToken: string,
): Promise<NativeAuthSession> {
  const now = Date.now();
  const oldRefreshTokenHash = await hashToken(refreshToken);

  const refresh = await ctx.runQuery(component.native.refreshTokens.getRefreshTokenByTokenHash, {
    tokenHash: oldRefreshTokenHash,
  });
  if (!refresh) {
    throw new Error("Invalid refresh token");
  }

  const session = await ctx.runQuery(component.native.sessions.getSessionBySessionId, {
    sessionId: refresh.sessionId,
  });
  /* A revoked session is not rejected here: a parallel request may have
   * just rotated this pair, in which case rotateSession reports "converge"
   * and a sibling session is minted below. Rejection stays inside the
   * mutations. */
  if (!session || session.expiresAt <= now) {
    throw new Error("Invalid refresh token");
  }

  /*
   * The session row carries its identity. A session without it cannot name
   * its identity — guessing a provider would bind the wrong one, so fail
   * closed. A malformed id makes the query's id validator throw — treat it
   * like a missing identity rather than a 500.
   */
  const sessionIdentityId = session.identityId;
  const [user, identity] = await Promise.all([
    ctx.runQuery(component.native.users.getUserById, { userId: refresh.userId }),
    sessionIdentityId
      ? ctx
          .runQuery(component.native.identities.getIdentityById, {
            identityId: sessionIdentityId,
          })
          .catch(() => null)
      : Promise.resolve(null),
  ]);
  if (!user) {
    throw new Error("User not found");
  }
  /* The identity must belong to the refresh token's user. convergeSession
   * re-checks this inside the mutation; this earlier check keeps the action
   * from minting a candidate pair it can never commit. */
  if (!identity || identity.userId !== refresh.userId) {
    throw new Error("Identity not found");
  }

  const sessionTtlMs = DEFAULT_SESSION_TTL_MS;
  const refreshTokenTtlMs = DEFAULT_REFRESH_TOKEN_TTL_MS;
  const expiresAt = now + sessionTtlMs;

  const mintSessionPair = async () => {
    const newSessionId = crypto.randomUUID();
    const newRefreshToken = generateVerificationToken();
    const token = await mintToken(
      user._id,
      newSessionId,
      { identityId: identity._id },
      { expiresInSeconds: Math.floor(sessionTtlMs / 1000) },
    );
    return {
      newSessionId,
      newRefreshToken,
      newRefreshTokenHash: await hashToken(newRefreshToken),
      token,
    };
  };

  const pair = await mintSessionPair();

  const result = await ctx.runMutation(component.native.sessions.rotateSession, {
    oldRefreshTokenHash,
    newSessionId: pair.newSessionId,
    newSessionToken: pair.token,
    newSessionExpiresAt: expiresAt,
    newRefreshTokenHash: pair.newRefreshTokenHash,
    newRefreshTokenExpiresAt: now + refreshTokenTtlMs,
    provider: "password",
    issuer: "native",
  });

  if (!result) {
    throw new Error("Invalid refresh token");
  }

  if (result === "converge") {
    /*
     * A parallel request already rotated this token inside the grace window.
     * Mint a sibling pair in the same family rather than letting its session
     * be revoked as replay.
     */
    const convergePair = await mintSessionPair();
    const convergeResult = await ctx.runMutation(component.native.sessions.convergeSession, {
      predecessorRefreshTokenHash: oldRefreshTokenHash,
      newSessionId: convergePair.newSessionId,
      newSessionToken: convergePair.token,
      newSessionExpiresAt: expiresAt,
      newRefreshTokenHash: convergePair.newRefreshTokenHash,
      newRefreshTokenExpiresAt: now + refreshTokenTtlMs,
    });
    if (!convergeResult) {
      throw new Error("Invalid refresh token");
    }
    return {
      token: convergePair.token,
      refreshToken: convergePair.newRefreshToken,
      user: toNativeAuthUser(convergeResult.user),
      userId: convergeResult.user._id,
      identityId: identity._id,
      sessionId: convergePair.newSessionId,
    };
  }

  return {
    token: pair.token,
    refreshToken: pair.newRefreshToken,
    user: toNativeAuthUser(result.user),
    userId: result.user._id,
    identityId: result.identityId,
    sessionId: pair.newSessionId,
  };
}
