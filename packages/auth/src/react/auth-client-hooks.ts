import { useCallback, useEffect, useState } from "react";

import type {
  ConvexBetterAuthClient,
  ConvexAuthSessionListItem,
  ConvexAuthState,
  ConvexAuthUserState,
} from "./auth-client-types";

export function useConvexAuthUser(authClient: ConvexBetterAuthClient | null): ConvexAuthUserState {
  if (authClient === null) {
    return {
      user: null,
      isLoaded: false,
      isSignedIn: false,
    };
  }

  const session = authClient.useSession();
  const user = session.data?.user;

  return {
    user:
      user === undefined
        ? null
        : {
            id: user.id,
            username: null,
            fullName: user.name ?? null,
            primaryEmailAddress: {
              emailAddress: user.email,
            },
          },
    isLoaded: !session.isPending,
    isSignedIn: user !== undefined,
  };
}

// internally. Web-first; RN exports symmetric hooks via runtime.tsx.

export type ConvexAuthSessionListState = {
  /** All active sessions for the current user. null until loaded. */
  sessions: ConvexAuthSessionListItem[] | null;
  isLoading: boolean;
  error: string | null;
  /** Re-fetch the list (e.g. after a revoke). */
  refetch: () => Promise<void>;
};

export function useConvexAuthSessionList(
  authClient: ConvexBetterAuthClient | null,
): ConvexAuthSessionListState {
  const [sessions, setSessions] = useState<ConvexAuthSessionListItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (authClient?.listSessions === undefined) {
      setSessions(null);
      setIsLoading(false);
      setError("Session listing is not available on this auth client");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await authClient.listSessions();
      if (result.error) {
        setError(result.error instanceof Error ? result.error.message : "Could not load sessions");
        setSessions(null);
        return;
      }
      setSessions(result.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load sessions");
      setSessions(null);
    } finally {
      setIsLoading(false);
    }
  }, [authClient]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { sessions, isLoading, error, refetch };
}

export type ConvexAuthRevokeSessionState = {
  revokeSession: (args: { token: string }) => Promise<{ ok: boolean; error: string | null }>;
  revokeOtherSessions: () => Promise<{ ok: boolean; error: string | null }>;
  isRevoking: boolean;
};

export function useConvexAuthRevokeSession(
  authClient: ConvexBetterAuthClient | null,
): ConvexAuthRevokeSessionState {
  const [isRevoking, setIsRevoking] = useState(false);

  const revokeSession = useCallback(
    async (args: { token: string }) => {
      if (authClient?.revokeSession === undefined) {
        return {
          ok: false,
          error: "Revoke is not available on this auth client",
        };
      }
      setIsRevoking(true);
      try {
        const result = await authClient.revokeSession(args);
        if (result.error) {
          const msg = result.error instanceof Error ? result.error.message : "Revoke failed";
          return { ok: false, error: msg };
        }
        return { ok: true, error: null };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Revoke failed",
        };
      } finally {
        setIsRevoking(false);
      }
    },
    [authClient],
  );

  const revokeOtherSessions = useCallback(async () => {
    if (authClient?.revokeOtherSessions === undefined) {
      return {
        ok: false,
        error: "Revoke is not available on this auth client",
      };
    }
    setIsRevoking(true);
    try {
      const result = await authClient.revokeOtherSessions();
      if (result.error) {
        const msg = result.error instanceof Error ? result.error.message : "Revoke failed";
        return { ok: false, error: msg };
      }
      return { ok: true, error: null };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Revoke failed",
      };
    } finally {
      setIsRevoking(false);
    }
  }, [authClient]);

  return { revokeSession, revokeOtherSessions, isRevoking };
}

export type ConvexAuthUpdateProfileState = {
  updateProfile: (args: {
    name?: string;
    image?: string;
  }) => Promise<{ ok: boolean; error: string | null }>;
  isUpdating: boolean;
};

export function useConvexAuthUpdateProfile(
  authClient: ConvexBetterAuthClient | null,
): ConvexAuthUpdateProfileState {
  const [isUpdating, setIsUpdating] = useState(false);

  const updateProfile = useCallback(
    async (args: { name?: string; image?: string }) => {
      if (authClient?.updateUser === undefined) {
        return {
          ok: false,
          error: "Profile update is not available on this auth client",
        };
      }
      setIsUpdating(true);
      try {
        const result = await authClient.updateUser(args);
        if (result.error) {
          const msg = result.error instanceof Error ? result.error.message : "Update failed";
          return { ok: false, error: msg };
        }
        return { ok: true, error: null };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Update failed",
        };
      } finally {
        setIsUpdating(false);
      }
    },
    [authClient],
  );

  return { updateProfile, isUpdating };
}

// ---- Password-recovery hooks (PR D) ----

export type ConvexAuthForgotPasswordState = {
  /**
   * Request a password-reset email. The token in the email links to a
   * page that calls `useConvexAuthResetPassword().resetPassword(...)`.
   * `redirectTo` is the absolute URL of that reset page on this app.
   */
  requestReset: (args: {
    email: string;
    redirectTo?: string;
  }) => Promise<{ ok: boolean; error: string | null }>;
  isRequesting: boolean;
};

export function useConvexAuthForgotPassword(
  authClient: ConvexBetterAuthClient | null,
): ConvexAuthForgotPasswordState {
  const [isRequesting, setIsRequesting] = useState(false);

  const requestReset = useCallback(
    async (args: { email: string; redirectTo?: string }) => {
      if (authClient?.forgetPassword === undefined) {
        return {
          ok: false,
          error: "Password recovery is not available on this auth client",
        };
      }
      setIsRequesting(true);
      try {
        const result = await authClient.forgetPassword(args);
        if (result.error) {
          const msg = result.error instanceof Error ? result.error.message : "Reset request failed";
          return { ok: false, error: msg };
        }
        if (
          typeof result.data === "object" &&
          result.data !== null &&
          "status" in result.data &&
          result.data.status !== "queued"
        ) {
          return {
            ok: false,
            error:
              (result.data as { reason?: string }).reason ?? "Reset request could not be queued",
          };
        }
        return { ok: true, error: null };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Reset request failed",
        };
      } finally {
        setIsRequesting(false);
      }
    },
    [authClient],
  );

  return { requestReset, isRequesting };
}

export type ConvexAuthResetPasswordState = {
  /**
   * Complete a password reset using a token from the recovery email.
   * The token is typically in the URL search params on the reset page.
   */
  resetPassword: (args: {
    newPassword: string;
    token: string;
  }) => Promise<{ ok: boolean; error: string | null }>;
  isResetting: boolean;
};

export function useConvexAuthResetPassword(
  authClient: ConvexBetterAuthClient | null,
): ConvexAuthResetPasswordState {
  const [isResetting, setIsResetting] = useState(false);

  const resetPassword = useCallback(
    async (args: { newPassword: string; token: string }) => {
      if (authClient?.resetPassword === undefined) {
        return {
          ok: false,
          error: "Password reset is not available on this auth client",
        };
      }
      setIsResetting(true);
      try {
        const result = await authClient.resetPassword(args);
        if (result.error) {
          const msg = result.error instanceof Error ? result.error.message : "Reset failed";
          return { ok: false, error: msg };
        }
        if (
          typeof result.data === "object" &&
          result.data !== null &&
          "status" in result.data &&
          result.data.status !== true
        ) {
          return {
            ok: false,
            error: (result.data as { reason?: string }).reason ?? "Password reset failed",
          };
        }
        return { ok: true, error: null };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Reset failed",
        };
      } finally {
        setIsResetting(false);
      }
    },
    [authClient],
  );

  return { resetPassword, isResetting };
}

// ---- Email-verification hooks ----

export type ConvexAuthVerifyEmailStatus = "idle" | "verifying" | "verified" | "error";

export type ConvexAuthVerifyEmailState = {
  status: ConvexAuthVerifyEmailStatus;
  error: string | null;
  verifyEmail: (args: { token: string }) => Promise<{ ok: boolean; error: string | null }>;
};

export function useConvexAuthVerifyEmail(
  authClient: ConvexBetterAuthClient | null,
): ConvexAuthVerifyEmailState {
  const [status, setStatus] = useState<ConvexAuthVerifyEmailStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const verifyEmail = useCallback(
    async (args: { token: string }) => {
      if (authClient?.verifyEmail === undefined) {
        const msg = "Email verification is not available on this auth client";
        setStatus("error");
        setError(msg);
        return { ok: false, error: msg };
      }
      setStatus("verifying");
      setError(null);
      try {
        const result = await authClient.verifyEmail({
          query: { token: args.token },
        });
        if (result.error) {
          const msg = result.error instanceof Error ? result.error.message : "Verification failed";
          setStatus("error");
          setError(msg);
          return { ok: false, error: msg };
        }
        if (
          typeof result.data === "object" &&
          result.data !== null &&
          "success" in result.data &&
          result.data.success !== true
        ) {
          const msg = (result.data as { reason?: string }).reason ?? "Verification failed";
          setStatus("error");
          setError(msg);
          return { ok: false, error: msg };
        }
        setStatus("verified");
        return { ok: true, error: null };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Verification failed";
        setStatus("error");
        setError(msg);
        return { ok: false, error: msg };
      }
    },
    [authClient],
  );

  return { status, error, verifyEmail };
}

export type ConvexAuthResendVerificationState = {
  resend: (args: {
    email: string;
    callbackURL?: string;
  }) => Promise<{ ok: boolean; error: string | null }>;
  isResending: boolean;
};

export function useConvexAuthResendVerification(
  authClient: ConvexBetterAuthClient | null,
): ConvexAuthResendVerificationState {
  const [isResending, setIsResending] = useState(false);

  const resend = useCallback(
    async (args: { email: string; callbackURL?: string }) => {
      if (authClient?.sendVerificationEmail === undefined) {
        return {
          ok: false,
          error: "Resend is not available on this auth client",
        };
      }
      setIsResending(true);
      try {
        const result = await authClient.sendVerificationEmail(args);
        if (result.error) {
          const msg = result.error instanceof Error ? result.error.message : "Resend failed";
          return { ok: false, error: msg };
        }
        return { ok: true, error: null };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Resend failed",
        };
      } finally {
        setIsResending(false);
      }
    },
    [authClient],
  );

  return { resend, isResending };
}

// ---- Email-change hooks ----

export type ConvexAuthChangeEmailState = {
  requestChange: (args: {
    newEmail: string;
    callbackURL?: string;
  }) => Promise<{ ok: boolean; error: string | null }>;
  isRequesting: boolean;
};

export function useConvexAuthChangeEmail(
  authClient: ConvexBetterAuthClient | null,
): ConvexAuthChangeEmailState {
  const [isRequesting, setIsRequesting] = useState(false);

  const requestChange = useCallback(
    async (args: { newEmail: string; callbackURL?: string }) => {
      if (authClient?.changeEmail === undefined) {
        return {
          ok: false,
          error: "Email change is not available on this auth client",
        };
      }
      setIsRequesting(true);
      try {
        const result = await authClient.changeEmail(args);
        if (result.error) {
          const msg =
            result.error instanceof Error ? result.error.message : "Email change request failed";
          return { ok: false, error: msg };
        }
        return { ok: true, error: null };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Email change request failed",
        };
      } finally {
        setIsRequesting(false);
      }
    },
    [authClient],
  );

  return { requestChange, isRequesting };
}

// ---- Profile image upload hook ----
//
// The package owns the orchestration (pick → upload → save), but the
// `uploadFile` strategy is consumer-provided so the package stays
// storage-agnostic. The canonical Convex implementation is a thin
// wrapper around `ctx.storage.generateUploadUrl()` + a POST; the
// package keeps that wiring out of the auth surface so consumers
// can swap storage without touching auth.

export type ConvexAuthUploadProfileImageState = {
  /**
   * Pick a file → upload via the provided strategy → write the
   * resulting URL onto the user's image. The whole flow flips a
   * single `isUploading` flag so consumers don't have to thread
   * three booleans.
   */
  uploadAndSave: (
    file: Blob | string,
  ) => Promise<{ ok: boolean; url: string | null; error: string | null }>;
  isUploading: boolean;
};

export function useConvexAuthUploadProfileImage(
  authClient: ConvexBetterAuthClient | null,
  options: { uploadFile: (file: Blob | string) => Promise<string> },
): ConvexAuthUploadProfileImageState {
  const [isUploading, setIsUploading] = useState(false);
  const { uploadFile } = options;

  const uploadAndSave = useCallback(
    async (file: Blob | string) => {
      if (authClient?.updateUser === undefined) {
        return {
          ok: false,
          url: null,
          error: "Profile update is not available on this auth client",
        };
      }
      setIsUploading(true);
      try {
        const url = await uploadFile(file);
        const result = await authClient.updateUser({ image: url });
        if (result.error) {
          const msg = result.error instanceof Error ? result.error.message : "Image save failed";
          return { ok: false, url: null, error: msg };
        }
        return { ok: true, url, error: null };
      } catch (err) {
        return {
          ok: false,
          url: null,
          error: err instanceof Error ? err.message : "Image upload failed",
        };
      } finally {
        setIsUploading(false);
      }
    },
    [authClient, uploadFile],
  );

  return { uploadAndSave, isUploading };
}

// ---- Two-factor (TOTP + backup codes) hooks ----
//
// Five guarded hooks covering the full 2FA surface: enroll, confirm
// (TOTP), confirm (backup code), disable, regenerate backup codes. Each
// returns `{ ok, error }` (plus enroll's `totpURI`/`backupCodes`) and a
// single in-flight boolean, identical in spirit to the password-recovery
// and session hooks above. When the auth client has no `twoFactor`
// namespace (plugin not wired), every hook returns a clear unavailable
// error instead of throwing.

const TWO_FACTOR_UNAVAILABLE = "Two-factor authentication is not available on this auth client";

export type ConvexAuthEnableTwoFactorResult = {
  ok: boolean;
  /** otpauth:// URI to render as a QR code. null on failure. */
  totpURI: string | null;
  /** One-time recovery codes. Show ONCE — never retrievable again. */
  backupCodes: string[] | null;
  error: string | null;
};

export type ConvexAuthEnableTwoFactorState = {
  /**
   * Begin enrollment: re-authenticates with the password, then returns
   * the otpauth URI + backup codes. 2FA is not yet active — the user
   * must confirm a TOTP code via `useConvexAuthVerifyTotp` first.
   */
  enable: (args: { password: string; issuer?: string }) => Promise<ConvexAuthEnableTwoFactorResult>;
  isEnabling: boolean;
};

export function useConvexAuthEnableTwoFactor(
  authClient: ConvexBetterAuthClient | null,
): ConvexAuthEnableTwoFactorState {
  const [isEnabling, setIsEnabling] = useState(false);

  const enable = useCallback(
    async (args: { password: string; issuer?: string }) => {
      if (authClient?.twoFactor?.enable === undefined) {
        return {
          ok: false,
          totpURI: null,
          backupCodes: null,
          error: TWO_FACTOR_UNAVAILABLE,
        };
      }
      setIsEnabling(true);
      try {
        const result = await authClient.twoFactor.enable(args);
        if (result.error) {
          const msg = result.error.message ?? "Could not enable two-factor authentication";
          return { ok: false, totpURI: null, backupCodes: null, error: msg };
        }
        return {
          ok: true,
          totpURI: result.data?.totpURI ?? null,
          backupCodes: result.data?.backupCodes ?? null,
          error: null,
        };
      } catch (err) {
        return {
          ok: false,
          totpURI: null,
          backupCodes: null,
          error: err instanceof Error ? err.message : "Could not enable two-factor authentication",
        };
      } finally {
        setIsEnabling(false);
      }
    },
    [authClient],
  );

  return { enable, isEnabling };
}

export type ConvexAuthVerifyTotpState = {
  /**
   * Confirm a 6-digit TOTP code. Used BOTH to finish enrollment and to
   * satisfy the 2FA step-up during sign-in. `trustDevice` skips 2FA on
   * this device for the Better Auth trust window.
   */
  verifyTotp: (args: {
    code: string;
    trustDevice?: boolean;
  }) => Promise<{ ok: boolean; error: string | null }>;
  isVerifying: boolean;
};

export function useConvexAuthVerifyTotp(
  authClient: ConvexBetterAuthClient | null,
): ConvexAuthVerifyTotpState {
  const [isVerifying, setIsVerifying] = useState(false);

  const verifyTotp = useCallback(
    async (args: { code: string; trustDevice?: boolean }) => {
      if (authClient?.twoFactor?.verifyTotp === undefined) {
        return { ok: false, error: TWO_FACTOR_UNAVAILABLE };
      }
      setIsVerifying(true);
      try {
        const result = await authClient.twoFactor.verifyTotp(args);
        if (result.error) {
          return { ok: false, error: result.error.message ?? "Invalid code" };
        }
        return { ok: true, error: null };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Invalid code",
        };
      } finally {
        setIsVerifying(false);
      }
    },
    [authClient],
  );

  return { verifyTotp, isVerifying };
}

export type ConvexAuthVerifyBackupCodeState = {
  /** Satisfy 2FA step-up with a one-time backup code instead of TOTP. */
  verifyBackupCode: (args: {
    code: string;
    trustDevice?: boolean;
  }) => Promise<{ ok: boolean; error: string | null }>;
  isVerifying: boolean;
};

export function useConvexAuthVerifyBackupCode(
  authClient: ConvexBetterAuthClient | null,
): ConvexAuthVerifyBackupCodeState {
  const [isVerifying, setIsVerifying] = useState(false);

  const verifyBackupCode = useCallback(
    async (args: { code: string; trustDevice?: boolean }) => {
      if (authClient?.twoFactor?.verifyBackupCode === undefined) {
        return { ok: false, error: TWO_FACTOR_UNAVAILABLE };
      }
      setIsVerifying(true);
      try {
        const result = await authClient.twoFactor.verifyBackupCode(args);
        if (result.error) {
          return {
            ok: false,
            error: result.error.message ?? "Invalid backup code",
          };
        }
        return { ok: true, error: null };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Invalid backup code",
        };
      } finally {
        setIsVerifying(false);
      }
    },
    [authClient],
  );

  return { verifyBackupCode, isVerifying };
}

export type ConvexAuthDisableTwoFactorState = {
  /** Turn 2FA off. Requires re-authentication with the password. */
  disable: (args: { password: string }) => Promise<{ ok: boolean; error: string | null }>;
  isDisabling: boolean;
};

export function useConvexAuthDisableTwoFactor(
  authClient: ConvexBetterAuthClient | null,
): ConvexAuthDisableTwoFactorState {
  const [isDisabling, setIsDisabling] = useState(false);

  const disable = useCallback(
    async (args: { password: string }) => {
      if (authClient?.twoFactor?.disable === undefined) {
        return { ok: false, error: TWO_FACTOR_UNAVAILABLE };
      }
      setIsDisabling(true);
      try {
        const result = await authClient.twoFactor.disable(args);
        if (result.error) {
          return {
            ok: false,
            error: result.error.message ?? "Could not disable two-factor",
          };
        }
        return { ok: true, error: null };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Could not disable two-factor",
        };
      } finally {
        setIsDisabling(false);
      }
    },
    [authClient],
  );

  return { disable, isDisabling };
}

export type ConvexAuthGenerateBackupCodesState = {
  /**
   * Regenerate the one-time recovery codes (invalidates the old set).
   * Requires re-authentication with the password.
   */
  generateBackupCodes: (args: { password: string }) => Promise<{
    ok: boolean;
    backupCodes: string[] | null;
    error: string | null;
  }>;
  isGenerating: boolean;
};

export function useConvexAuthGenerateBackupCodes(
  authClient: ConvexBetterAuthClient | null,
): ConvexAuthGenerateBackupCodesState {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateBackupCodes = useCallback(
    async (args: { password: string }) => {
      if (authClient?.twoFactor?.generateBackupCodes === undefined) {
        return { ok: false, backupCodes: null, error: TWO_FACTOR_UNAVAILABLE };
      }
      setIsGenerating(true);
      try {
        const result = await authClient.twoFactor.generateBackupCodes(args);
        if (result.error) {
          return {
            ok: false,
            backupCodes: null,
            error: result.error.message ?? "Could not regenerate backup codes",
          };
        }
        return {
          ok: true,
          backupCodes: result.data?.backupCodes ?? null,
          error: null,
        };
      } catch (err) {
        return {
          ok: false,
          backupCodes: null,
          error: err instanceof Error ? err.message : "Could not regenerate backup codes",
        };
      } finally {
        setIsGenerating(false);
      }
    },
    [authClient],
  );

  return { generateBackupCodes, isGenerating };
}

/**
 * Extract the base32 shared secret from an `otpauth://` URI so the
 * enroll UI can offer manual entry as a fallback to scanning the QR.
 * Returns null if the URI has no `secret` param.
 */
export function extractTotpSecret(totpURI: string): string | null {
  try {
    const url = new URL(totpURI);
    return url.searchParams.get("secret");
  } catch {
    // Some authenticator URIs aren't strictly URL-parseable; fall back
    // to a regex scrape of the secret query param.
    const match = totpURI.match(/[?&]secret=([^&]+)/i);
    const secret = match?.[1];
    return secret === undefined ? null : decodeURIComponent(secret);
  }
}

export function useAuthState(authClient: ConvexBetterAuthClient | null): ConvexAuthState {
  if (authClient === null) {
    return {
      isLoaded: false,
      isSignedIn: false,
    };
  }

  const session = authClient.useSession();
  return {
    isLoaded: !session.isPending,
    isSignedIn: session.data !== null && session.data !== undefined,
  };
}

export function getConvexAuthActions(args: {
  authClient: ConvexBetterAuthClient | null;
  signInPath: string;
  signUpPath: string;
  assignLocation?: (url: string) => void;
}) {
  const assignLocation =
    args.assignLocation ??
    ((url: string) => {
      if (typeof window !== "undefined") {
        window.location.assign(url);
      }
    });

  return {
    signInSocial: async (options: { provider: string; callbackURL?: string }) => {
      if (args.authClient === null) {
        return;
      }

      await args.authClient.signIn.social({
        provider: options.provider,
        callbackURL: options.callbackURL,
      });
    },
    signOut: async (options?: { redirectUrl?: string }) => {
      if (args.authClient !== null) {
        await args.authClient.signOut({
          fetchOptions: {
            credentials: "include",
          },
        });
      }

      assignLocation(options?.redirectUrl ?? args.signInPath);
    },
    redirectToSignIn: async (options?: { signInForceRedirectUrl?: string }) => {
      assignLocation(options?.signInForceRedirectUrl ?? args.signInPath);
    },
    redirectToSignUp: async () => {
      assignLocation(args.signUpPath);
    },
    buildSignUpUrl: () => args.signUpPath,
  };
}
