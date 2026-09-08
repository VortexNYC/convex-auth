import { useAction, useConvex, useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const TOKEN_KEY = "convex-auth-token";
const REFRESH_TOKEN_KEY = "convex-auth-refresh-token";
const SESSION_ID_KEY = "convex-auth-session-id";
const REFRESH_BUFFER_MS = 60_000;

export type TokenStorage = {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
};

function createBrowserStorage(store: Storage): TokenStorage {
  return {
    get: (key) => {
      try {
        return store.getItem(key);
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      try {
        store.setItem(key, value);
      } catch {
        // ignore storage quota / private mode errors
      }
    },
    remove: (key) => {
      try {
        store.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}

function createMemoryStorage(): TokenStorage {
  const store = new Map<string, string>();
  return {
    get: (key) => store.get(key) ?? null,
    set: (key, value) => store.set(key, value),
    remove: (key) => store.delete(key),
  };
}

function resolveStorage(storage?: ConvexAuthProviderProps["storage"]): TokenStorage {
  if (typeof storage === "object" && storage !== null) {
    return storage;
  }
  if (typeof window !== "undefined") {
    if (storage === "session") {
      return createBrowserStorage(window.sessionStorage);
    }
    return createBrowserStorage(window.localStorage);
  }
  return createMemoryStorage();
}

function getTokenExpiry(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const payload = parts[1];
  if (!payload) {
    return null;
  }
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  const base64 = normalized + "=".repeat(padding);
  try {
    const json = atob(base64);
    const parsed = JSON.parse(json) as { exp?: number };
    if (typeof parsed.exp !== "number") {
      return null;
    }
    return parsed.exp * 1000;
  } catch {
    return null;
  }
}

export type NativeAuthSignUpArgs = {
  email: string;
  password: string;
  name: string;
  image?: string;
  callbackURL?: string;
  rememberMe?: boolean;
};

export type NativeAuthSignInArgs = {
  email: string;
  password: string;
  callbackURL?: string;
  rememberMe?: boolean;
};

export type NativeAuthSignInMagicLinkArgs = {
  email: string;
  name?: string;
  callbackURL?: string;
  newUserCallbackURL?: string;
  errorCallbackURL?: string;
  metadata?: Record<string, string>;
};

export type NativeAuthSignInWithRedirectArgs = {
  provider: string;
  callbackURL?: string;
  errorURL?: string;
  newUserURL?: string;
  requestSignUp?: boolean;
  link?: boolean;
};

export type NativeAuthSignInWithRedirectResult = { url: string };

export type NativeAuthOAuthCallbackArgs = {
  provider: string;
  code: string;
  state: string;
  linkingUserId?: string;
};

export type NativeAuthOAuthCallbackSuccess = {
  token: string;
  refreshToken: string;
  userId: string;
  identityId: string;
  sessionId: string;
  redirectUrl: string;
  createdUser: boolean;
};

export type NativeAuthOAuthCallbackError = {
  error: string;
  errorDescription?: string;
  redirectUrl: string;
};

export type NativeAuthOAuthCallbackResult =
  | NativeAuthOAuthCallbackSuccess
  | NativeAuthOAuthCallbackError;

export type NativeAuthSendVerificationOtpArgs = {
  email: string;
  type?: string;
  name?: string;
};

export type NativeAuthVerifyEmailOtpArgs = {
  email: string;
  otp: string;
  type?: string;
  newPassword?: string;
};

export type NativeAuthVerifyEmailOtpResult =
  | NativeAuthSession
  | NativeAuthVerifyResult
  | NativeAuthResetResult
  | NativeAuthChangeEmailResult;

export type NativeAuthChangeEmailResult = { status: boolean; reason?: string };

export type NativeAuthChangeEmailArgs = {
  newEmail: string;
  callbackURL?: string;
};

export type NativeAuthTwoFactorEnableArgs = {
  token: string;
  password: string;
  issuer?: string;
};

export type NativeAuthTwoFactorVerifyArgs = {
  token: string;
  code: string;
  trustDevice?: boolean;
};

// Two-factor verification returns a full session on success, identical to
// a completed sign-in.
export type NativeAuthTwoFactorVerifyResult = NativeAuthSession;

export type NativeAuthTwoFactorDisableArgs = {
  token: string;
  password: string;
};

export type NativeAuthTwoFactorGenerateBackupCodesArgs = {
  token: string;
};

export type NativeAuthTwoFactorGenerateBackupCodesResult = {
  backupCodes: string[];
};

export type NativeAuthTwoFactorEnableResult = {
  totpURI?: string;
  backupCodes?: string[];
  error?: string;
};

export type NativeAuthSignOutArgs = {
  token: string;
  callbackURL?: string;
};

export type NativeAuthUser = {
  id: string;
  email?: string;
  name?: string;
  image?: string;
  emailVerified: boolean;
  createdAt: number;
  updatedAt: number;
};

export type NativeAuthTwoFactorResult = {
  twoFactorRedirect?: boolean;
  twoFactorMethods?: string[];
  twoFactorChallengeToken?: string;
  trustDeviceToken?: string;
  trustDeviceMaxAgeMs?: number;
};

export type NativeAuthSession = {
  token: string | null;
  refreshToken?: string;
  user: NativeAuthUser;
  userId?: string;
  identityId?: string;
  sessionId?: string;
  redirect?: boolean;
  url?: string;
} & NativeAuthTwoFactorResult;

export type NativeAuthSignOutResult = {
  success: boolean;
  redirect?: boolean;
  url?: string;
};

export type NativeAuthSendResult = {
  status: "queued" | "not_configured" | "failed";
  reason?: string;
  emailId?: string;
};

export type NativeAuthVerifyResult = {
  success: boolean;
  reason?: string;
};

export type NativeAuthResetResult = { status: boolean; reason?: string };

export type NativeAuthActions = {
  signUp: FunctionReference<"action", "public", NativeAuthSignUpArgs, NativeAuthSession>;
  signIn: FunctionReference<"action", "public", NativeAuthSignInArgs, NativeAuthSession>;
  signOut: FunctionReference<"action", "public", NativeAuthSignOutArgs, NativeAuthSignOutResult>;
  sendEmailVerification: FunctionReference<
    "action",
    "public",
    { email: string; callbackURL?: string },
    NativeAuthSendResult
  >;
  verifyEmail: FunctionReference<"action", "public", { token: string }, NativeAuthVerifyResult>;
  sendPasswordReset: FunctionReference<
    "action",
    "public",
    { email: string; redirectTo?: string },
    NativeAuthSendResult
  >;
  resetPassword: FunctionReference<
    "action",
    "public",
    { token: string; newPassword: string },
    NativeAuthResetResult
  >;
  verifyPassword: FunctionReference<
    "action",
    "public",
    { token: string; password: string },
    { success: boolean }
  >;
  updateSession: FunctionReference<"action", "public", { refreshToken: string }, NativeAuthSession>;
  verifySession: FunctionReference<
    "query",
    "public",
    { token?: string; sessionId?: string },
    { user?: NativeAuthUser; sessionId?: string }
  >;
  signInMagicLink?: FunctionReference<
    "action",
    "public",
    NativeAuthSignInMagicLinkArgs,
    NativeAuthSendResult
  >;
  signInWithRedirect?: FunctionReference<
    "action",
    "public",
    NativeAuthSignInWithRedirectArgs,
    NativeAuthSignInWithRedirectResult
  >;
  callback?: FunctionReference<
    "action",
    "public",
    NativeAuthOAuthCallbackArgs,
    NativeAuthOAuthCallbackResult
  >;
  sendVerificationOtp?: FunctionReference<
    "action",
    "public",
    NativeAuthSendVerificationOtpArgs,
    NativeAuthSendResult
  >;
  verifyEmailOtp?: FunctionReference<
    "action",
    "public",
    NativeAuthVerifyEmailOtpArgs,
    NativeAuthVerifyEmailOtpResult
  >;
  twoFactorEnable?: FunctionReference<
    "action",
    "public",
    NativeAuthTwoFactorEnableArgs,
    NativeAuthTwoFactorEnableResult
  >;
  twoFactorVerifyTOTP?: FunctionReference<
    "action",
    "public",
    NativeAuthTwoFactorVerifyArgs,
    NativeAuthTwoFactorVerifyResult
  >;
  twoFactorVerifyBackupCode?: FunctionReference<
    "action",
    "public",
    NativeAuthTwoFactorVerifyArgs,
    NativeAuthTwoFactorVerifyResult
  >;
  twoFactorDisable?: FunctionReference<
    "action",
    "public",
    NativeAuthTwoFactorDisableArgs,
    { success: boolean }
  >;
  twoFactorGenerateBackupCodes?: FunctionReference<
    "action",
    "public",
    NativeAuthTwoFactorGenerateBackupCodesArgs,
    NativeAuthTwoFactorGenerateBackupCodesResult
  >;
};

type ConvexAuthContextValue = NativeAuthActions & {
  token: string | null;
  setToken: (token: string | null) => void;
  refreshToken: string | null;
  setRefreshToken: (refreshToken: string | null) => void;
  sessionId: string | null;
  setSessionId: (sessionId: string | null) => void;
};

const ConvexAuthContext = createContext<ConvexAuthContextValue | null>(null);

export type ConvexAuthProviderProps = {
  actions: NativeAuthActions;
  children: ReactNode;
  storage?: "local" | "session" | TokenStorage;
  initialToken?: string | null;
  initialRefreshToken?: string | null;
  initialSessionId?: string | null;
};

export function ConvexAuthProvider(props: ConvexAuthProviderProps) {
  const client = useConvex();
  const updateSessionAction = useAction(props.actions.updateSession);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [storage, setStorage] = useState<TokenStorage | null>(null);
  const isHydrating = useRef(true);

  useEffect(() => {
    const resolved = resolveStorage(props.storage);
    setStorage(resolved);

    let initialToken = props.initialToken ?? null;
    let initialRefresh = props.initialRefreshToken ?? null;
    let initialSessionId = props.initialSessionId ?? null;

    if (!initialToken && typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      initialToken = searchParams.get("token");
      initialRefresh = searchParams.get("refreshToken");
      initialSessionId = searchParams.get("sessionId");
      if (initialToken) {
        searchParams.delete("token");
        searchParams.delete("refreshToken");
        searchParams.delete("sessionId");
        const cleaned =
          searchParams.toString() === ""
            ? window.location.pathname
            : `${window.location.pathname}?${searchParams.toString()}`;
        window.history.replaceState(null, "", cleaned);
      }
    }

    if (!initialToken) {
      initialToken = resolved.get(TOKEN_KEY);
      initialRefresh = resolved.get(REFRESH_TOKEN_KEY);
      initialSessionId = resolved.get(SESSION_ID_KEY);
    }

    if (initialToken) {
      setToken(initialToken);
      if (initialRefresh) {
        setRefreshToken(initialRefresh);
      }
      if (initialSessionId) {
        setSessionId(initialSessionId);
      }
      const expiry = getTokenExpiry(initialToken);
      if (expiry !== null && expiry <= Date.now() + REFRESH_BUFFER_MS && initialRefresh) {
        updateSessionAction({ refreshToken: initialRefresh })
          .then((session) => {
            setToken(session.token ?? null);
            setRefreshToken(session.refreshToken ?? null);
            setSessionId(session.sessionId ?? null);
          })
          .catch(() => {
            setToken(null);
            setRefreshToken(null);
            setSessionId(null);
          });
      }
    }
    isHydrating.current = false;
  }, [
    props.storage,
    props.initialToken,
    props.initialRefreshToken,
    props.initialSessionId,
    updateSessionAction,
  ]);

  useEffect(() => {
    client.setAuth(() => Promise.resolve(token));
  }, [client, token]);

  useEffect(() => {
    return () => {
      client.clearAuth();
    };
  }, [client]);

  useEffect(() => {
    if (storage === null || isHydrating.current) {
      return;
    }
    if (token) {
      storage.set(TOKEN_KEY, token);
    } else {
      storage.remove(TOKEN_KEY);
    }
    if (refreshToken) {
      storage.set(REFRESH_TOKEN_KEY, refreshToken);
    } else {
      storage.remove(REFRESH_TOKEN_KEY);
    }
    if (sessionId) {
      storage.set(SESSION_ID_KEY, sessionId);
    } else {
      storage.remove(SESSION_ID_KEY);
    }
  }, [storage, token, refreshToken, sessionId]);

  useEffect(() => {
    if (!token || !refreshToken) {
      return;
    }
    const expiry = getTokenExpiry(token);
    if (expiry === null) {
      return;
    }
    const delay = Math.max(0, expiry - Date.now() - REFRESH_BUFFER_MS);
    const timeout = setTimeout(() => {
      updateSessionAction({ refreshToken })
        .then((session) => {
          setToken(session.token ?? null);
          setRefreshToken(session.refreshToken ?? null);
          setSessionId(session.sessionId ?? null);
        })
        .catch(() => {
          setToken(null);
          setRefreshToken(null);
          setSessionId(null);
        });
    }, delay);
    return () => clearTimeout(timeout);
  }, [token, refreshToken, updateSessionAction]);

  const value = useMemo(() => {
    const state = { token, setToken, refreshToken, setRefreshToken, sessionId, setSessionId };
    return new Proxy(props.actions, {
      get(target, prop, receiver) {
        if (typeof prop === "string" && prop in state) {
          return (state as Record<string, unknown>)[prop];
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as unknown as ConvexAuthContextValue;
  }, [props.actions, token, refreshToken, sessionId]);
  return <ConvexAuthContext.Provider value={value}>{props.children}</ConvexAuthContext.Provider>;
}

export function useAuthActions() {
  const ctx = useContext(ConvexAuthContext);
  const client = useConvex();
  if (ctx === null) {
    throw new Error("useAuthActions must be used within a ConvexAuthProvider");
  }

  const signUpAction = useAction(ctx.signUp);
  const signInAction = useAction(ctx.signIn);
  const signInMagicLinkAction = ctx.signInMagicLink ? useAction(ctx.signInMagicLink) : null;
  const sendVerificationOtpAction = ctx.sendVerificationOtp
    ? useAction(ctx.sendVerificationOtp)
    : null;
  const verifyEmailOtpAction = ctx.verifyEmailOtp ? useAction(ctx.verifyEmailOtp) : null;
  const signOutAction = useAction(ctx.signOut);
  const updateSessionAction = useAction(ctx.updateSession);
  const sendEmailVerificationAction = useAction(ctx.sendEmailVerification);
  const verifyEmailAction = useAction(ctx.verifyEmail);
  const sendPasswordResetAction = useAction(ctx.sendPasswordReset);
  const resetPasswordAction = useAction(ctx.resetPassword);
  const verifyPasswordAction = useAction(ctx.verifyPassword);
  const twoFactorEnableAction = ctx.twoFactorEnable ? useAction(ctx.twoFactorEnable) : null;
  const twoFactorVerifyTOTPAction = ctx.twoFactorVerifyTOTP
    ? useAction(ctx.twoFactorVerifyTOTP)
    : null;
  const twoFactorVerifyBackupCodeAction = ctx.twoFactorVerifyBackupCode
    ? useAction(ctx.twoFactorVerifyBackupCode)
    : null;
  const twoFactorDisableAction = ctx.twoFactorDisable ? useAction(ctx.twoFactorDisable) : null;
  const twoFactorGenerateBackupCodesAction = ctx.twoFactorGenerateBackupCodes
    ? useAction(ctx.twoFactorGenerateBackupCodes)
    : null;

  const [isLoading, setIsLoading] = useState(false);

  const signUp = useCallback(
    async (args: NativeAuthSignUpArgs) => {
      setIsLoading(true);
      try {
        const session = await signUpAction(args);
        ctx.setToken(session.token ?? null);
        ctx.setSessionId(session.sessionId ?? null);
        if (session.refreshToken) {
          ctx.setRefreshToken(session.refreshToken);
        }
        return session;
      } finally {
        setIsLoading(false);
      }
    },
    [signUpAction, ctx],
  );

  const signIn = useCallback(
    async (args: NativeAuthSignInArgs) => {
      setIsLoading(true);
      try {
        const session = await signInAction(args);
        ctx.setToken(session.token ?? null);
        ctx.setSessionId(session.sessionId ?? null);
        if (session.refreshToken) {
          ctx.setRefreshToken(session.refreshToken);
        }
        return session;
      } finally {
        setIsLoading(false);
      }
    },
    [signInAction, ctx],
  );

  const signInWithMagicLink = useCallback(
    async (args: NativeAuthSignInMagicLinkArgs) => {
      if (!signInMagicLinkAction) {
        throw new Error("Magic link authentication is not configured");
      }
      setIsLoading(true);
      try {
        return await signInMagicLinkAction(args);
      } finally {
        setIsLoading(false);
      }
    },
    [signInMagicLinkAction],
  );

  const signInWithRedirect = useCallback(
    async (args: NativeAuthSignInWithRedirectArgs) => {
      if (!ctx.signInWithRedirect) {
        throw new Error("OAuth sign-in is not configured");
      }
      setIsLoading(true);
      try {
        return await client.action(ctx.signInWithRedirect, args);
      } finally {
        setIsLoading(false);
      }
    },
    [client, ctx.signInWithRedirect],
  );

  const oauthCallback = useCallback(
    async (args: NativeAuthOAuthCallbackArgs) => {
      if (!ctx.callback) {
        throw new Error("OAuth callback is not configured");
      }
      setIsLoading(true);
      try {
        const result = await client.action(ctx.callback, args);
        if ("token" in result) {
          ctx.setToken(result.token);
          ctx.setSessionId(result.sessionId);
          ctx.setRefreshToken(result.refreshToken);
        }
        return result;
      } finally {
        setIsLoading(false);
      }
    },
    [client, ctx.callback],
  );

  const signInWithEmailOtp = useCallback(
    async (args: NativeAuthSendVerificationOtpArgs) => {
      if (!sendVerificationOtpAction) {
        throw new Error("Email OTP authentication is not configured");
      }
      setIsLoading(true);
      try {
        return await sendVerificationOtpAction({ ...args, type: args.type ?? "sign-in" });
      } finally {
        setIsLoading(false);
      }
    },
    [sendVerificationOtpAction],
  );

  const sendVerificationOtp = useCallback(
    async (args: NativeAuthSendVerificationOtpArgs) => {
      if (!sendVerificationOtpAction) {
        throw new Error("Email OTP authentication is not configured");
      }
      setIsLoading(true);
      try {
        return await sendVerificationOtpAction(args);
      } finally {
        setIsLoading(false);
      }
    },
    [sendVerificationOtpAction],
  );

  const changeEmail = useCallback(
    async (args: NativeAuthChangeEmailArgs) => {
      if (!sendVerificationOtpAction) {
        throw new Error("Email OTP authentication is not configured");
      }
      const trimmed = args.newEmail.trim().toLowerCase();
      if (trimmed.length === 0) {
        throw new Error("Invalid email");
      }
      setIsLoading(true);
      try {
        return await sendVerificationOtpAction({
          email: trimmed,
          type: "change-email",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [sendVerificationOtpAction],
  );

  const verifyEmailOtp = useCallback(
    async (args: NativeAuthVerifyEmailOtpArgs) => {
      if (!verifyEmailOtpAction) {
        throw new Error("Email OTP authentication is not configured");
      }
      setIsLoading(true);
      try {
        const result = await verifyEmailOtpAction(args);
        if ("token" in result && "refreshToken" in result) {
          ctx.setToken(result.token ?? null);
          ctx.setSessionId(result.sessionId ?? null);
          if (result.refreshToken) {
            ctx.setRefreshToken(result.refreshToken);
          }
        }
        return result;
      } finally {
        setIsLoading(false);
      }
    },
    [verifyEmailOtpAction, ctx],
  );
  const signOut = useCallback(
    async (args?: { callbackURL?: string }): Promise<NativeAuthSignOutResult> => {
      if (ctx.token === null) {
        ctx.setRefreshToken(null);
        return { success: true };
      }
      setIsLoading(true);
      try {
        const result = await signOutAction({ token: ctx.token, callbackURL: args?.callbackURL });
        ctx.setToken(null);
        ctx.setRefreshToken(null);
        ctx.setSessionId(null);
        return result;
      } finally {
        setIsLoading(false);
      }
    },
    [signOutAction, ctx],
  );

  const updateSession = useCallback(async () => {
    if (ctx.refreshToken === null) {
      throw new Error("No refresh token available");
    }
    setIsLoading(true);
    try {
      const session = await updateSessionAction({ refreshToken: ctx.refreshToken });
      ctx.setToken(session.token ?? null);
      ctx.setSessionId(session.sessionId ?? null);
      if (session.refreshToken) {
        ctx.setRefreshToken(session.refreshToken);
      }
      return session;
    } finally {
      setIsLoading(false);
    }
  }, [updateSessionAction, ctx]);

  const sendEmailVerification = useCallback(
    async (args: { email: string; callbackURL?: string }) => {
      setIsLoading(true);
      try {
        return await sendEmailVerificationAction(args);
      } finally {
        setIsLoading(false);
      }
    },
    [sendEmailVerificationAction],
  );

  const verifyEmail = useCallback(
    async (token: string) => {
      setIsLoading(true);
      try {
        return await verifyEmailAction({ token });
      } finally {
        setIsLoading(false);
      }
    },
    [verifyEmailAction],
  );

  const sendPasswordReset = useCallback(
    async (args: { email: string; redirectTo?: string }) => {
      setIsLoading(true);
      try {
        return await sendPasswordResetAction(args);
      } finally {
        setIsLoading(false);
      }
    },
    [sendPasswordResetAction],
  );

  const resetPassword = useCallback(
    async (args: { token: string; newPassword: string }) => {
      setIsLoading(true);
      try {
        return await resetPasswordAction(args);
      } finally {
        setIsLoading(false);
      }
    },
    [resetPasswordAction],
  );

  const verifyPassword = useCallback(
    async (args: { token: string; password: string }) => {
      setIsLoading(true);
      try {
        return await verifyPasswordAction(args);
      } finally {
        setIsLoading(false);
      }
    },
    [verifyPasswordAction],
  );

  const twoFactor = useMemo(() => {
    const notAvailable = async () => {
      throw new Error("Two-factor authentication is not configured");
    };
    return {
      enable: twoFactorEnableAction
        ? async (args: { password: string; issuer?: string }) => {
            if (ctx.token === null) {
              throw new Error("Session required to enable two-factor authentication");
            }
            return await twoFactorEnableAction({
              token: ctx.token,
              password: args.password,
              issuer: args.issuer,
            });
          }
        : notAvailable,
      verifyTotp: twoFactorVerifyTOTPAction
        ? async (args: NativeAuthTwoFactorVerifyArgs) => {
            return await twoFactorVerifyTOTPAction(args);
          }
        : notAvailable,
      verifyBackupCode: twoFactorVerifyBackupCodeAction
        ? async (args: NativeAuthTwoFactorVerifyArgs) => {
            return await twoFactorVerifyBackupCodeAction(args);
          }
        : notAvailable,
      disable: twoFactorDisableAction
        ? async (args: { password: string }) => {
            if (ctx.token === null) {
              throw new Error("Session required to disable two-factor authentication");
            }
            return await twoFactorDisableAction({
              token: ctx.token,
              password: args.password,
            });
          }
        : notAvailable,
      generateBackupCodes: twoFactorGenerateBackupCodesAction
        ? async () => {
            if (ctx.token === null) {
              throw new Error("Session required to generate backup codes");
            }
            return await twoFactorGenerateBackupCodesAction({ token: ctx.token });
          }
        : notAvailable,
    };
  }, [
    ctx,
    twoFactorEnableAction,
    twoFactorVerifyTOTPAction,
    twoFactorVerifyBackupCodeAction,
    twoFactorDisableAction,
    twoFactorGenerateBackupCodesAction,
  ]);

  const session = useQuery(
    ctx.verifySession,
    ctx.token ? { token: ctx.token, sessionId: ctx.sessionId ?? undefined } : "skip",
  );
  const isSessionLoading = ctx.token !== null && session === undefined;
  const user = session?.user ?? null;
  const sessionId = session?.sessionId ?? null;

  return {
    signUp,
    signIn,
    signInWithMagicLink,
    signInWithRedirect,
    oauthCallback,
    signInWithEmailOtp,
    sendVerificationOtp,
    changeEmail,
    verifyEmailOtp,
    signOut,
    updateSession,
    twoFactor,
    sendEmailVerification,
    verifyEmail,
    sendPasswordReset,
    resetPassword,
    verifyPassword,
    token: ctx.token,
    setToken: ctx.setToken,
    refreshToken: ctx.refreshToken,
    setRefreshToken: ctx.setRefreshToken,
    user,
    sessionId,
    setSessionId: ctx.setSessionId,
    isLoading: isLoading || isSessionLoading,
    isAuthenticated: user !== null,
  };
}

export function useSession(): {
  user: NativeAuthUser | null;
  sessionId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
} {
  const ctx = useContext(ConvexAuthContext);
  if (ctx === null) {
    throw new Error("useSession must be used within a ConvexAuthProvider");
  }
  const session = useQuery(
    ctx.verifySession,
    ctx.token ? { token: ctx.token, sessionId: ctx.sessionId ?? undefined } : "skip",
  );
  const isLoading = ctx.token !== null && session === undefined;
  const user = session?.user ?? null;
  return {
    user,
    sessionId: session?.sessionId ?? null,
    isLoading,
    isAuthenticated: user !== null,
  };
}

export function useUser(): NativeAuthUser | null {
  const { user } = useSession();
  return user;
}
