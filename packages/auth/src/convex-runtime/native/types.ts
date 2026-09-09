import { v } from "convex/values";
import type { FunctionReference } from "convex/server";

export type VerificationCodeType =
  | "email_verification"
  | "password_reset"
  | "email_change"
  | "two_factor_pending"
  | "two_factor_trusted_device";

export type NativeAuthUser = {
  id: string;
  email?: string;
  name?: string;
  image?: string;
  emailVerified: boolean;
  emailTwoFactorStatus?: "disabled" | "enabled" | "reset_required";
  emailTwoFactorEmail?: string;
  emailTwoFactorEnabledAt?: number;
  emailTwoFactorDisabledAt?: number;
  emailTwoFactorLastVerifiedAt?: number;
  emailTwoFactorResetAt?: number;
  emailTwoFactorResetReason?: "missing_email" | "email_not_verified" | "email_changed";
  twoFactorEnabled: boolean;
  activeOrganizationId?: string;
  isActive: boolean;
  isSuperAdmin?: boolean;
  metadataJson?: string;
  createdAt: number;
  updatedAt: number;
};

export function toNativeAuthUser(user: NativeUserDoc): NativeAuthUser {
  const now = Date.now();
  const nativeUser: NativeAuthUser = {
    id: user._id,
    email: user.email,
    name: user.name,
    image: user.image,
    emailVerified: user.emailVerified,
    twoFactorEnabled: user.twoFactorEnabled ?? false,
    isActive: user.isActive ?? true,
    createdAt: user.createdAt ?? now,
    updatedAt: user.updatedAt ?? now,
  };
  if (user.emailTwoFactorStatus !== undefined)
    nativeUser.emailTwoFactorStatus = user.emailTwoFactorStatus;
  if (user.emailTwoFactorEmail !== undefined)
    nativeUser.emailTwoFactorEmail = user.emailTwoFactorEmail;
  if (user.emailTwoFactorEnabledAt !== undefined)
    nativeUser.emailTwoFactorEnabledAt = user.emailTwoFactorEnabledAt;
  if (user.emailTwoFactorDisabledAt !== undefined)
    nativeUser.emailTwoFactorDisabledAt = user.emailTwoFactorDisabledAt;
  if (user.emailTwoFactorLastVerifiedAt !== undefined)
    nativeUser.emailTwoFactorLastVerifiedAt = user.emailTwoFactorLastVerifiedAt;
  if (user.emailTwoFactorResetAt !== undefined)
    nativeUser.emailTwoFactorResetAt = user.emailTwoFactorResetAt;
  if (user.emailTwoFactorResetReason !== undefined)
    nativeUser.emailTwoFactorResetReason = user.emailTwoFactorResetReason;
  if (user.activeOrganizationId !== undefined)
    nativeUser.activeOrganizationId = user.activeOrganizationId;
  if (user.isSuperAdmin !== undefined) nativeUser.isSuperAdmin = user.isSuperAdmin;
  if (user.metadataJson !== undefined) nativeUser.metadataJson = user.metadataJson;
  return nativeUser;
}

export const nativeAuthUserValidator = v.object({
  id: v.string(),
  email: v.optional(v.string()),
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  emailVerified: v.boolean(),
  emailTwoFactorStatus: v.optional(
    v.union(v.literal("disabled"), v.literal("enabled"), v.literal("reset_required")),
  ),
  emailTwoFactorEmail: v.optional(v.string()),
  emailTwoFactorEnabledAt: v.optional(v.number()),
  emailTwoFactorDisabledAt: v.optional(v.number()),
  emailTwoFactorLastVerifiedAt: v.optional(v.number()),
  emailTwoFactorResetAt: v.optional(v.number()),
  emailTwoFactorResetReason: v.optional(
    v.union(
      v.literal("missing_email"),
      v.literal("email_not_verified"),
      v.literal("email_changed"),
    ),
  ),
  twoFactorEnabled: v.boolean(),
  activeOrganizationId: v.optional(v.string()),
  isActive: v.boolean(),
  isSuperAdmin: v.optional(v.boolean()),
  metadataJson: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export type NativeAuthSession = {
  token: string | null;
  refreshToken?: string;
  user: NativeAuthUser;
  userId?: string;
  identityId?: string;
  sessionId?: string;
  redirect?: boolean;
  url?: string;
  twoFactorRedirect?: boolean;
  twoFactorMethods?: string[];
  twoFactorChallengeToken?: string;
  twoFactorCookieMaxAgeMs?: number;
  trustDeviceToken?: string;
  trustDeviceMaxAgeMs?: number;
};

export type NativeVerificationCodeDoc = {
  _id: string;
  _creationTime?: number;
  userId: string;
  type: VerificationCodeType;
  tokenHash: string;
  expiresAt: number;
  consumedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type NativeVerifierDoc = {
  _id: string;
  _creationTime?: number;
  verifierId: string;
  type: string;
  provider?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  redirectUri?: string;
  metadata?: string;
  expiresAt: number;
  consumedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type NativeUserDoc = {
  _id: string;
  _creationTime?: number;
  email?: string;
  name?: string;
  image?: string;
  emailVerified: boolean;
  emailTwoFactorStatus?: "disabled" | "enabled" | "reset_required";
  emailTwoFactorEmail?: string;
  emailTwoFactorEnabledAt?: number;
  emailTwoFactorDisabledAt?: number;
  emailTwoFactorLastVerifiedAt?: number;
  emailTwoFactorResetAt?: number;
  emailTwoFactorResetReason?: "missing_email" | "email_not_verified" | "email_changed";
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
  twoFactorBackupCodes?: string[];
  activeOrganizationId?: string;
  isActive?: boolean;
  isSuperAdmin?: boolean;
  metadataJson?: string;
  createdAt?: number;
  updatedAt?: number;
};

export type NativeAccountDoc = {
  _id: string;
  _creationTime?: number;
  userId: string;
  provider: string;
  issuer: string;
  subject: string;
  credentialHash: string;
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  tokenType?: string;
  scopes?: string[];
  accessTokenExpiresAt?: number;
  refreshTokenExpiresAt?: number;
  createdAt?: number;
  updatedAt?: number;
};

export type NativeSessionDoc = {
  _id: string;
  _creationTime?: number;
  sessionId: string;
  userId: string;
  token: string;
  expiresAt: number;
  ipAddress?: string;
  userAgent?: string;
  revokedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type NativeRefreshTokenDoc = {
  _id: string;
  _creationTime?: number;
  tokenHash: string;
  sessionId: string;
  userId: string;
  expiresAt: number;
  revokedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type NativeIdentityDoc = {
  _id: string;
  _creationTime?: number;
  identityId?: string;
  userId: string;
  provider: string;
  issuer: string;
  subject: string;
  tokenIdentifier?: string;
  email?: string;
  emailVerified: boolean;
  sessionId?: string | null;
  createdAt?: number;
  updatedAt?: number;
};

export type NativeEmailAndPasswordComponentHandle = {
  identity: {
    provisionFromIdentity: FunctionReference<
      "mutation",
      "public" | "internal",
      {
        identity: {
          identityId: string;
          provider: string;
          issuer: string;
          subject: string;
          tokenIdentifier: string;
          email?: string;
          emailVerified: boolean;
          sessionId?: string | null;
        };
        user: {
          email?: string;
          name?: string;
          image?: string;
          emailVerified: boolean;
        };
        account?: { credentialHash: string };
        verificationCode?: { tokenHash: string; expiresAt: number };
        initialSession?: {
          sessionId: string;
          sessionExpiresAt: number;
          refreshTokenHash: string;
          refreshTokenExpiresAt: number;
        };
        allowLink?: boolean;
      },
      {
        createdUser: boolean;
        identityId?: string;
        linkedExistingIdentity: boolean;
        userId: string;
        duplicate?: boolean;
        user?: NativeUserDoc;
        sessionId?: string;
        token?: string;
      },
      string
    >;
    getUserAndAccount: FunctionReference<
      "query",
      "public" | "internal",
      { email: string },
      { user: NativeUserDoc; identity: NativeIdentityDoc; account: NativeAccountDoc } | null,
      string
    >;
    verifyEmail: FunctionReference<
      "mutation",
      "public" | "internal",
      { tokenHash: string; provider: string; issuer: string },
      { success: boolean; user?: NativeUserDoc; reason?: string },
      string
    >;
    resetPassword: FunctionReference<
      "mutation",
      "public" | "internal",
      {
        tokenHash: string;
        credentialHash: string;
        provider: string;
        issuer: string;
        revokeSessions?: boolean;
      },
      { status: boolean; user?: NativeUserDoc; reason?: string },
      string
    >;
    changeEmail: FunctionReference<
      "mutation",
      "public" | "internal",
      {
        tokenHash: string;
        newEmail: string;
      },
      { status: boolean; user?: NativeUserDoc; reason?: string },
      string
    >;
  };
  native: {
    accounts: {
      createAccount: FunctionReference<
        "mutation",
        "public" | "internal",
        {
          userId: string;
          provider: string;
          issuer: string;
          subject: string;
          credentialHash: string;
          accessToken?: string;
          refreshToken?: string;
          idToken?: string;
          tokenType?: string;
          scopes?: string[];
          accessTokenExpiresAt?: number;
          refreshTokenExpiresAt?: number;
        },
        string,
        string
      >;
      updateCredentialHash: FunctionReference<
        "mutation",
        "public" | "internal",
        { accountId: string; credentialHash: string },
        void,
        string
      >;
      updateAccountTokens: FunctionReference<
        "mutation",
        "public" | "internal",
        {
          accountId: string;
          accessToken?: string;
          refreshToken?: string;
          idToken?: string;
          tokenType?: string;
          scopes?: string[];
          accessTokenExpiresAt?: number;
          refreshTokenExpiresAt?: number;
        },
        void,
        string
      >;
      getAccountBySubject: FunctionReference<
        "query",
        "public" | "internal",
        { provider: string; issuer: string; subject: string },
        NativeAccountDoc | null,
        string
      >;
    };
    rateLimits: {
      recordAttempt: FunctionReference<
        "mutation",
        "public" | "internal",
        { identifier: string; windowStart: number; windowMs: number; maxAttempts: number },
        { allowed: boolean; count: number },
        string
      >;
      checkRateLimit: FunctionReference<
        "query",
        "public" | "internal",
        { identifier: string; windowStart: number; windowMs: number; maxAttempts: number },
        { allowed: boolean; count: number },
        string
      >;
    };
    sessions: {
      createSession: FunctionReference<
        "mutation",
        "public" | "internal",
        {
          sessionId: string;
          userId: string;
          token: string;
          expiresAt: number;
        },
        string,
        string
      >;
      createSessionAndRefreshToken: FunctionReference<
        "mutation",
        "public" | "internal",
        {
          sessionId: string;
          userId: string;
          token: string;
          sessionExpiresAt: number;
          refreshTokenHash: string;
          refreshTokenExpiresAt: number;
        },
        string,
        string
      >;
      revokeSession: FunctionReference<
        "mutation",
        "public" | "internal",
        { sessionId: string },
        string | null,
        string
      >;
      listSessionsByUser: FunctionReference<
        "query",
        "public" | "internal",
        { userId: string },
        NativeSessionDoc[],
        string
      >;
      getSessionByToken: FunctionReference<
        "query",
        "public" | "internal",
        { token: string },
        NativeSessionDoc | null,
        string
      >;
      getSessionBySessionId: FunctionReference<
        "query",
        "public" | "internal",
        { sessionId: string },
        NativeSessionDoc | null,
        string
      >;
      revokeSessionsForUser: FunctionReference<
        "mutation",
        "public" | "internal",
        { userId: string; excludeSessionId?: string },
        number,
        string
      >;
      rotateSession: FunctionReference<
        "mutation",
        "public" | "internal",
        {
          oldRefreshTokenHash: string;
          newSessionId: string;
          newSessionToken: string;
          newSessionExpiresAt: number;
          newSessionIpAddress?: string;
          newSessionUserAgent?: string;
          newRefreshTokenHash: string;
          newRefreshTokenExpiresAt: number;
          provider: string;
          issuer: string;
        },
        { user: NativeUserDoc; identityId: string } | null,
        string
      >;
    };
    refreshTokens: {
      createRefreshToken: FunctionReference<
        "mutation",
        "public" | "internal",
        { tokenHash: string; sessionId: string; userId: string; expiresAt: number },
        string,
        string
      >;
      getRefreshTokenByTokenHash: FunctionReference<
        "query",
        "public" | "internal",
        { tokenHash: string },
        NativeRefreshTokenDoc | null,
        string
      >;
      consumeRefreshToken: FunctionReference<
        "mutation",
        "public" | "internal",
        { tokenHash: string },
        NativeRefreshTokenDoc | null,
        string
      >;
      revokeRefreshTokensForSession: FunctionReference<
        "mutation",
        "public" | "internal",
        { sessionId: string },
        number,
        string
      >;
      revokeRefreshTokensForUser: FunctionReference<
        "mutation",
        "public" | "internal",
        { userId: string },
        number,
        string
      >;
    };
    identities: {
      getNativeIdentityByUser: FunctionReference<
        "query",
        "public" | "internal",
        { userId: string; provider: string; issuer: string },
        NativeIdentityDoc | null,
        string
      >;
      markEmailVerified: FunctionReference<
        "mutation",
        "public" | "internal",
        { identityId: string; emailVerified: boolean },
        void,
        string
      >;
    };
    users: {
      getUserByEmail: FunctionReference<
        "query",
        "public" | "internal",
        { email: string },
        NativeUserDoc | null,
        string
      >;
      getUserById: FunctionReference<
        "query",
        "public" | "internal",
        { userId: string },
        NativeUserDoc | null,
        string
      >;
      markEmailVerified: FunctionReference<
        "mutation",
        "public" | "internal",
        { userId: string; emailVerified: boolean },
        void,
        string
      >;
      setTwoFactor: FunctionReference<
        "mutation",
        "public" | "internal",
        {
          userId: string;
          twoFactorEnabled: boolean;
          twoFactorSecret?: string;
          twoFactorBackupCodes?: string[];
        },
        void,
        string
      >;
      consumeBackupCode: FunctionReference<
        "mutation",
        "public" | "internal",
        { userId: string; backupCodeHash: string },
        { success: boolean },
        string
      >;
      updateUser: FunctionReference<
        "mutation",
        "public" | "internal",
        {
          userId: string;
          name?: string;
          image?: string;
          metadataJson?: string;
        },
        void,
        string
      >;
    };
    codes: {
      createVerificationCode: FunctionReference<
        "mutation",
        "public" | "internal",
        {
          userId: string;
          type: VerificationCodeType;
          tokenHash: string;
          expiresAt: number;
        },
        string,
        string
      >;
      getVerificationCodeByTokenHash: FunctionReference<
        "query",
        "public" | "internal",
        { tokenHash: string; type: VerificationCodeType },
        NativeVerificationCodeDoc | null,
        string
      >;
      consumeVerificationCode: FunctionReference<
        "mutation",
        "public" | "internal",
        { tokenHash: string; type: VerificationCodeType },
        NativeVerificationCodeDoc | null,
        string
      >;
      revokeVerificationCodesForUser: FunctionReference<
        "mutation",
        "public" | "internal",
        { userId: string; type: VerificationCodeType },
        number,
        string
      >;
    };
    verifiers: {
      createVerifier: FunctionReference<
        "mutation",
        "public" | "internal",
        {
          verifierId: string;
          type: string;
          provider?: string;
          codeChallenge?: string;
          codeChallengeMethod?: string;
          redirectUri?: string;
          metadata?: string;
          expiresAt: number;
        },
        string,
        string
      >;
      getVerifierByVerifierId: FunctionReference<
        "query",
        "public" | "internal",
        { verifierId: string },
        NativeVerifierDoc | null,
        string
      >;
      consumeVerifier: FunctionReference<
        "mutation",
        "public" | "internal",
        { verifierId: string },
        NativeVerifierDoc | null,
        string
      >;
    };
  };
};

/**
 * OAuth reuses the same component functions as native email/password.
 */
export type NativeOAuthComponentHandle = NativeEmailAndPasswordComponentHandle;
