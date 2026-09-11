import type { ReactNode } from "react";

import type { AuthReadinessState, AuthRuntimeStatus } from "../core";

export type { AuthReadinessState, AuthRuntimeStatus };

export type BetterAuthUser = {
  id: string;
  email: string;
  emailVerified?: boolean;
  image?: string | null;
  name?: string | null;
};

export type BetterAuthSession = {
  id: string;
  token?: string | null;
};

export type BetterAuthSessionState = {
  data?: {
    session: BetterAuthSession;
    user: BetterAuthUser;
  } | null;
  error?: Error | null;
  isPending: boolean;
  isRefetching?: boolean;
};

export type BetterAuthResponse = {
  // When two-factor is enabled for the account, sign-in does NOT
  // complete — the native server returns `data.twoFactorRedirect: true` and
  // a short-lived 2FA-pending challenge token. Consumers check this flag to
  // route into <ConvexVerifyTwoFactorForm>. Absent on every non-2FA flow.
  data?: ({ twoFactorRedirect?: boolean } & Record<string, unknown>) | null;
  error: {
    message?: string | null;
  } | null;
};

export type ConvexBetterAuthClient = {
  useSession(): BetterAuthSessionState;
  signOut(args?: { fetchOptions?: Omit<RequestInit, "body"> & { body?: never } }): Promise<unknown>;
  signIn: {
    email(args: {
      email: string;
      password: string;
      callbackURL?: string;
      rememberMe?: boolean;
    }): Promise<BetterAuthResponse>;
    social(args: { provider: string; callbackURL?: string }): Promise<BetterAuthResponse>;
    anonymous(args?: { rememberMe?: boolean }): Promise<BetterAuthResponse>;
  };
  linkAccount?: (args: {
    email: string;
    password: string;
    name?: string;
    image?: string;
  }) => Promise<BetterAuthResponse>;
  signInWithMagicLink?: (args: {
    email: string;
    name?: string;
    callbackURL?: string;
    newUserCallbackURL?: string;
    errorCallbackURL?: string;
    metadata?: Record<string, string>;
  }) => Promise<{
    data?: { status: string; reason?: string | null; emailId?: string | null } | null;
    error: { message?: string | null } | null;
  }>;
  signInWithEmailOtp?: (args: { email: string; type?: string; name?: string }) => Promise<{
    data?: { status: string; reason?: string | null; emailId?: string | null } | null;
    error: { message?: string | null } | null;
  }>;
  verifyEmailOtp?: (args: { email: string; otp: string; type?: string }) => Promise<{
    data?: unknown | null;
    error: { message?: string | null } | null;
  }>;
  signUp: {
    email(args: {
      name: string;
      email: string;
      password: string;
      image?: string;
      callbackURL?: string;
      rememberMe?: boolean;
    }): Promise<BetterAuthResponse>;
  };
  convex?: {
    token(): Promise<{ data?: { token: string | null } }>;
  };
  listSessions?: () => Promise<{
    data?: ConvexAuthSessionListItem[] | null;
    error?: unknown;
  }>;
  revokeSession?: (args: { token: string }) => Promise<{
    data?: { status?: boolean } | null;
    error?: unknown;
  }>;
  revokeOtherSessions?: () => Promise<{
    data?: { status?: boolean } | null;
    error?: unknown;
  }>;
  updateUser?: (args: { name?: string; image?: string }) => Promise<{
    data?: unknown;
    error?: unknown;
  }>;
  forgetPassword?: (args: { email: string; redirectTo?: string }) => Promise<{
    data?: unknown;
    error?: unknown;
  }>;
  resetPassword?: (args: { newPassword: string; token: string }) => Promise<{
    data?: unknown;
    error?: unknown;
  }>;
  sendVerificationEmail?: (args: { email: string; callbackURL?: string }) => Promise<{
    data?: unknown;
    error?: unknown;
  }>;
  verifyEmail?: (args: { query: { token: string } }) => Promise<{
    data?: unknown;
    error?: unknown;
  }>;
  changeEmail?: (args: { newEmail: string; callbackURL?: string }) => Promise<{
    data?: unknown;
    error?: unknown;
  }>;
  twoFactor?: ConvexBetterAuthTwoFactorApi;
};

/** @deprecated Use `ConvexAuthClient` instead. */
export type ConvexAuthClient = ConvexBetterAuthClient;

export type ConvexBetterAuthTwoFactorApi = {
  enable: (args: { password: string; issuer?: string }) => Promise<{
    data?: { totpURI: string; backupCodes: string[] } | null;
    error?: { message?: string | null } | null;
  }>;
  verifyTotp: (args: { code: string; trustDevice?: boolean }) => Promise<{
    data?: { token?: string | null } | null;
    error?: { message?: string | null } | null;
  }>;
  verifyBackupCode: (args: { code: string; trustDevice?: boolean }) => Promise<{
    data?: { token?: string | null } | null;
    error?: { message?: string | null } | null;
  }>;
  disable: (args: { password: string }) => Promise<{
    data?: { status?: boolean } | null;
    error?: { message?: string | null } | null;
  }>;
  generateBackupCodes: (args: { password: string }) => Promise<{
    data?: { status?: boolean; backupCodes: string[] } | null;
    error?: { message?: string | null } | null;
  }>;
};

export type ConvexAuthSessionListItem = {
  id: string;
  token: string;
  userId: string;
  expiresAt: string | Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type ConvexAuthState = {
  isLoaded: boolean;
  isSignedIn: boolean;
};

export type ConvexAuthSocialProvider = {
  provider: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
};

export type ConvexAuthUserState = {
  user: {
    id: string;
    username: string | null;
    fullName: string | null;
    primaryEmailAddress: {
      emailAddress: string;
    } | null;
  } | null;
  isLoaded: boolean;
  isSignedIn: boolean;
};

export type ConvexAuthRuntimeWindow = Window & {
  __authRuntime?: {
    getConvexToken: (args?: { forceRefreshToken?: boolean }) => Promise<string | null>;
  };
};

export type ConvexAuthCaptureException = (
  error: unknown,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    level?: "warning" | "error";
  },
) => void;
