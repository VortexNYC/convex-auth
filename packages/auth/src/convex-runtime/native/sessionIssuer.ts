import type { GenericActionCtx } from "convex/server";
import type { DataModel, Id } from "../../component/_generated/dataModel.js";
import { mintToken } from "./jwt.js";
import { hashPassword, shouldRehashAfterVerify } from "./password.js";
import { generateVerificationToken, hashToken } from "./tokens.js";
import {
  toNativeAuthUser,
  type NativeAuthSession,
  type NativeEmailAndPasswordComponentHandle,
  type NativeUserDoc,
} from "./types.js";

const DONT_REMEMBER_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TWO_FACTOR_PENDING_TTL_MS = 10 * 60 * 1000;

export function resolveSessionTtlMs(rememberMe: boolean | undefined, sessionTtlMs: number): number {
  return rememberMe === false ? DONT_REMEMBER_SESSION_TTL_MS : sessionTtlMs;
}

export function createSessionIssuer(
  component: NativeEmailAndPasswordComponentHandle,
  options: { sessionTtlMs: number; refreshTokenTtlMs: number },
) {
  async function createSessionAndRefreshToken(
    ctx: GenericActionCtx<DataModel>,
    args: {
      userId: string;
      identityId: string;
      rememberMe: boolean | undefined;
      credentialId?: string;
    },
  ): Promise<{ sessionId: string; token: string; refreshToken: string }> {
    const now = Date.now();
    const sessionId = crypto.randomUUID();
    const refreshToken = generateVerificationToken();
    const refreshTokenHash = await hashToken(refreshToken);
    const effectiveSessionTtlMs = resolveSessionTtlMs(args.rememberMe, options.sessionTtlMs);
    const expiresAt = now + effectiveSessionTtlMs;
    const token = await mintToken(
      args.userId,
      sessionId,
      { identityId: args.identityId },
      { expiresInSeconds: Math.floor(effectiveSessionTtlMs / 1000) },
    );

    await ctx.runMutation(component.native.sessions.createSessionAndRefreshToken, {
      sessionId,
      userId: args.userId,
      identityId: args.identityId,
      token,
      credentialId: args.credentialId,
      sessionExpiresAt: expiresAt,
      refreshTokenHash,
      refreshTokenExpiresAt: now + options.refreshTokenTtlMs,
    });

    return { sessionId, token, refreshToken };
  }

  async function handleTwoFactorSignIn(
    ctx: GenericActionCtx<DataModel>,
    user: NativeUserDoc,
    identityId: string,
    rememberMe: boolean | undefined,
    trustedDeviceToken?: string,
  ): Promise<NativeAuthSession> {
    if (!user.twoFactorEnabled) {
      const { sessionId, token, refreshToken } = await createSessionAndRefreshToken(ctx, {
        userId: user._id,
        identityId,
        rememberMe,
      });
      return {
        token,
        refreshToken,
        user: toNativeAuthUser(user),
        userId: user._id,
        identityId,
        sessionId,
      };
    }

    if (trustedDeviceToken) {
      const tokenHash = await hashToken(trustedDeviceToken);
      const trusted = await ctx.runQuery(component.native.codes.getVerificationCodeByTokenHash, {
        tokenHash,
        type: "two_factor_trusted_device",
      });
      if (trusted && (trusted.expiresAt ?? 0) > Date.now() && trusted.userId === user._id) {
        const { sessionId, token, refreshToken } = await createSessionAndRefreshToken(ctx, {
          userId: user._id,
          identityId,
          rememberMe,
        });
        return {
          token,
          refreshToken,
          user: toNativeAuthUser(user),
          userId: user._id,
          identityId,
          sessionId,
        };
      }
    }

    const challengeToken = generateVerificationToken();
    const tokenHash = await hashToken(challengeToken);
    await ctx.runMutation(component.native.codes.createVerificationCode, {
      userId: user._id,
      type: "two_factor_pending",
      tokenHash,
      identityId,
      rememberMe,
      expiresAt: Date.now() + DEFAULT_TWO_FACTOR_PENDING_TTL_MS,
    });

    return {
      token: null,
      user: toNativeAuthUser(user),
      userId: user._id,
      identityId,
      twoFactorRedirect: true,
      twoFactorMethods: ["totp"],
      twoFactorChallengeToken: challengeToken,
      twoFactorCookieMaxAgeMs: DEFAULT_TWO_FACTOR_PENDING_TTL_MS,
    };
  }

  /**
   * Imported bcrypt credentials (Clerk CSV exports, WorkOS handoffs) are
   * rehashed to argon2id on first successful verify so bcrypt only ever
   * serves the one-time migration bridge — every subsequent sign-in hits
   * the native hasher.
   */
  async function rehashMigratedCredential(
    ctx: GenericActionCtx<DataModel>,
    account: { _id: string; credentialHash: string },
    password: string,
  ) {
    if (!shouldRehashAfterVerify(account.credentialHash)) return;
    const credentialHash = await hashPassword(password);
    /* CAS: if a reset landed between read and write, keep the newer hash. */
    await ctx.runMutation(component.native.accounts.updateCredentialHash, {
      accountId: account._id as Id<"authAccounts">,
      credentialHash,
      expectedCredentialHash: account.credentialHash,
    });
  }

  return { createSessionAndRefreshToken, handleTwoFactorSignIn, rehashMigratedCredential };
}
