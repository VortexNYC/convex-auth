import { useAction, useConvex, useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import type { NativeAuthUser } from "../convex-runtime/native/types.js";
import type { ConvexAuthSessionListItem } from "./auth-client-types";
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

export type NativeAuthUpdateUserArgs = {
  token: string;
  name?: string;
  image?: string;
  metadataJson?: string;
};

export type NativeAuthUpdateUserResult = { success: boolean; error?: string };

export type NativeAuthTwoFactorEnableArgs = {
  token: string;
  password: string;
  issuer?: string;
};

export type NativeAuthTwoFactorVerifyArgs = {
  /**
   * The pending challenge token returned by the sign-in attempt. Required
   * unless the session is stored in cookies (`storageMode: "cookies"`), where
   * the SSR proxy substitutes it from the HttpOnly pending cookie.
   */
  token?: string;
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
  password: string;
};

export type NativeAuthTwoFactorGenerateBackupCodesResult = {
  backupCodes: string[];
  error?: string;
};

export type NativeAuthTwoFactorEnableResult = {
  token?: string;
  totpURI?: string;
  backupCodes?: string[];
  error?: string;
};

export type NativeAuthSignOutArgs = {
  token: string;
  callbackURL?: string;
};

export type { NativeAuthUser };

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
  updateUser?: FunctionReference<
    "action",
    "public",
    NativeAuthUpdateUserArgs,
    NativeAuthUpdateUserResult
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
  listSessions?: FunctionReference<
    "action",
    "public",
    { token: string },
    ConvexAuthSessionListItem[]
  >;
  revokeSession?: FunctionReference<
    "action",
    "public",
    { token: string; sessionId: string },
    { success: boolean }
  >;
  revokeOtherSessions?: FunctionReference<
    "action",
    "public",
    { token: string },
    { success: boolean }
  >;
  signInAnonymous?: FunctionReference<
    "action",
    "public",
    { rememberMe?: boolean },
    NativeAuthSession
  >;
  linkAnonymousAccount?: FunctionReference<
    "action",
    "public",
    { email: string; password: string; name?: string; image?: string },
    NativeAuthSession
  >;
} & Partial<NativePasskeyFunctionReferences>;

type NativePasskeyFunctionReferences = {
  getPasskeyRegistrationOptions: FunctionReference<"action">;
  verifyPasskeyRegistration: FunctionReference<"action">;
  getPasskeyAuthenticationOptions: FunctionReference<"action">;
  verifyPasskeyAuthentication: FunctionReference<"action">;
  listPasskeys: FunctionReference<"query">;
  revokePasskey: FunctionReference<"mutation">;
  renamePasskey: FunctionReference<"mutation">;
};

type ConvexAuthContextValue = NativeAuthActions & {
  token: string | null;
  setToken: (token: string | null) => void;
  refreshToken: string | null;
  setRefreshToken: (refreshToken: string | null) => void;
  sessionId: string | null;
  setSessionId: (sessionId: string | null) => void;
  twoFactorChallengeToken: string | null;
  setTwoFactorChallengeToken: (token: string | null) => void;
  isAuthReady: boolean;
  /**
   * `"cookies"` when the session is stored in HttpOnly cookies managed by an
   * SSR adapter (e.g. `@vortex-api/convex-auth/nextjs`). The access token is
   * held in memory only and every session-minting write goes through the
   * adapter's proxy endpoint.
   */
  storageMode?: "cookies";
  /** Proxy endpoint for session-minting actions in cookie mode. */
  apiRoute?: string;
  /** Server-resolved user for a no-flash first paint in cookie mode. */
  initialUser?: NativeAuthUser | null;
};

export const ConvexAuthContext = createContext<ConvexAuthContextValue | null>(null);

export type ConvexAuthProviderProps = {
  actions: NativeAuthActions;
  children: ReactNode;
  storage?: "local" | "session" | TokenStorage;
  /**
   * `"cookies"` stores the session in HttpOnly cookies managed by an SSR
   * adapter. The access token lives in memory only, the refresh token never
   * reaches the browser, and session-minting writes go through the adapter's
   * proxy endpoint (`apiRoute`). `storage` and URL token ingestion are
   * disabled in this mode.
   */
  storageMode?: "cookies";
  /** Proxy endpoint for session-minting actions in cookie mode. Defaults to `/api/auth`. */
  apiRoute?: string;
  /** Server-resolved user, so `isAuthenticated` is correct on first paint. */
  initialUser?: NativeAuthUser | null;
  initialToken?: string | null;
  initialRefreshToken?: string | null;
  initialSessionId?: string | null;
  /**
   * Fresh server-resolved state, re-delivered by the SSR adapter on each
   * server render. In cookie mode the provider re-seeds token/sessionId when
   * `_timeFetched` advances, so a middleware-rotated session reaches the
   * mounted client; a stale payload (framework cache) is ignored via the
   * watermark. Only meaningful with `storageMode: "cookies"`.
   */
  serverState?: {
    token: string | null;
    user: NativeAuthUser | null;
    sessionId: string | null;
    _timeFetched: number;
  };
  /**
   * Called when the session transitions between authenticated and
   * unauthenticated (not on mount). SSR adapters use it to invalidate
   * framework caches — e.g. Next.js's Router Cache — after sign-in/sign-out.
   */
  onAuthChange?: (authenticated: boolean) => unknown;
};

/**
 * Cookie mode has no web storage to act as the freshness oracle upstream uses
 * for `serverState`. The only stale-payload hazard is a framework cache serving
 * an older server render during a soft navigation — scoped to this tab and
 * this module instance — so a module-level watermark is the equivalent guard.
 */
let lastAppliedServerStateFetch = 0;

export function ConvexAuthProvider(props: ConvexAuthProviderProps) {
  const client = useConvex();
  const updateSessionAction = useAction(props.actions.updateSession);
  const cookieMode = props.storageMode === "cookies";
  const seedToken = props.serverState?.token ?? props.initialToken ?? null;
  const [token, setToken] = useState<string | null>(seedToken);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(
    props.serverState?.sessionId ?? props.initialSessionId ?? null,
  );
  const [twoFactorChallengeToken, setTwoFactorChallengeToken] = useState<string | null>(null);
  // A server-seeded token was verified during this render — the client is
  // already authenticated; `setAuth`'s async handshake only confirms it.
  const [isAuthReady, setIsAuthReady] = useState(cookieMode && seedToken !== null);
  const [storage, setStorage] = useState<TokenStorage | null>(null);
  const isHydrating = useRef(true);

  // The user attached to the most recently accepted server state — the
  // no-flash paint fallback while the live `verifySession` query is loading.
  // State, not a ref: a newer payload may carry a fresh user over an
  // unchanged token, and the context memo must see that change.
  const [serverUser, setServerUser] = useState<NativeAuthUser | null>(
    props.serverState?.user ?? props.initialUser ?? null,
  );

  useEffect(() => {
    if (cookieMode) {
      // Cookie mode: the server middleware owns refresh and the token lives
      // in memory only. No storage, no URL ingestion, no mount-time refresh.
      // What does run: re-seeding from a newer serverState — middleware may
      // have rotated the session since this client mounted.
      const serverState = props.serverState;
      if (serverState !== undefined && serverState._timeFetched > lastAppliedServerStateFetch) {
        lastAppliedServerStateFetch = serverState._timeFetched;
        setServerUser(serverState.user);
        setToken(serverState.token);
        setSessionId(serverState.sessionId);
      }
      isHydrating.current = false;
      return;
    }
    const resolved = resolveStorage(props.storage);
    setStorage(resolved);

    let initialToken = props.initialToken ?? null;
    let initialRefresh = props.initialRefreshToken ?? null;
    let initialSessionId = props.initialSessionId ?? null;

    if (!initialToken && typeof window !== "undefined" && window.location) {
      const searchParams = new URLSearchParams(window.location.search);
      // If the URL carries a reset flag, the token is a password-reset
      // token, not a session token. Leave it for the reset form to consume.
      if (!searchParams.has("reset")) {
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
    cookieMode,
    props.storage,
    props.initialToken,
    props.initialRefreshToken,
    props.initialSessionId,
    props.serverState,
    updateSessionAction,
  ]);

  useEffect(() => {
    if (token === null) {
      setIsAuthReady(false);
    }
    client.setAuth(
      () => Promise.resolve(token),
      (authenticated) => {
        setIsAuthReady(authenticated);
      },
    );
  }, [client, token]);

  useEffect(() => {
    return () => {
      client.clearAuth();
    };
  }, [client]);

  useEffect(() => {
    if (cookieMode || storage === null || isHydrating.current) {
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
  }, [cookieMode, storage, token, refreshToken, sessionId]);

  useEffect(() => {
    if (cookieMode || !token || !refreshToken) {
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
  }, [cookieMode, token, refreshToken, updateSessionAction]);

  const onAuthChangeRef = useRef(props.onAuthChange);
  onAuthChangeRef.current = props.onAuthChange;
  const wasAuthenticated = useRef<boolean | null>(null);
  useEffect(() => {
    const authenticated = token !== null;
    if (wasAuthenticated.current === null) {
      wasAuthenticated.current = authenticated;
      return;
    }
    if (wasAuthenticated.current !== authenticated) {
      wasAuthenticated.current = authenticated;
      void onAuthChangeRef.current?.(authenticated);
    }
  }, [token]);

  const value = useMemo(() => {
    const state = {
      token,
      setToken,
      refreshToken,
      setRefreshToken,
      sessionId,
      setSessionId,
      twoFactorChallengeToken,
      setTwoFactorChallengeToken,
      isAuthReady,
      storageMode: cookieMode ? ("cookies" as const) : undefined,
      apiRoute: props.apiRoute,
      initialUser: serverUser,
    };
    return new Proxy(props.actions, {
      get(target, prop, receiver) {
        if (typeof prop === "string" && prop in state) {
          return (state as Record<string, unknown>)[prop];
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as unknown as ConvexAuthContextValue;
  }, [
    props.actions,
    props.apiRoute,
    cookieMode,
    token,
    refreshToken,
    sessionId,
    twoFactorChallengeToken,
    isAuthReady,
    serverUser,
  ]);
  return <ConvexAuthContext.Provider value={value}>{props.children}</ConvexAuthContext.Provider>;
}

/**
 * POST a session-minting intent to the SSR adapter's proxy endpoint. The
 * server substitutes confidential values (refresh token, 2FA pending token,
 * trusted-device token) from HttpOnly cookies and writes result cookies on
 * the response.
 */
export async function callAuthProxy(
  apiRoute: string,
  intent: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(apiRoute, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent, args }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : `Auth request failed (${res.status})`,
    );
  }
  return body;
}

type SessionLike = {
  token?: string | null;
  refreshToken?: string | null;
  sessionId?: string | null;
  twoFactorChallengeToken?: string | null;
  twoFactorRedirect?: boolean;
};

export function useAuthActions() {
  const ctx = useContext(ConvexAuthContext);
  const client = useConvex();
  if (ctx === null) {
    throw new Error("useAuthActions must be used within a ConvexAuthProvider");
  }

  const signUpAction = useAction(ctx.signUp);
  const signInAction = useAction(ctx.signIn);
  const signInAnonymousAction = ctx.signInAnonymous ? useAction(ctx.signInAnonymous) : null;
  const linkAnonymousAccountAction = ctx.linkAnonymousAccount
    ? useAction(ctx.linkAnonymousAccount)
    : null;
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
  const updateUserAction = ctx.updateUser ? useAction(ctx.updateUser) : null;
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
  const listSessionsAction = ctx.listSessions ? useAction(ctx.listSessions) : null;
  const revokeSessionAction = ctx.revokeSession ? useAction(ctx.revokeSession) : null;
  const revokeOtherSessionsAction = ctx.revokeOtherSessions
    ? useAction(ctx.revokeOtherSessions)
    : null;

  const [isLoading, setIsLoading] = useState(false);

  const cookieMode = ctx.storageMode === "cookies";
  const apiRoute = ctx.apiRoute ?? "/api/auth";
  const callProxy = useCallback(
    <T = SessionLike,>(intent: string, args: Record<string, unknown>) =>
      callAuthProxy(apiRoute, intent, args) as Promise<T>,
    [apiRoute],
  );
  // Apply a minted session to state. In cookie mode the refresh token never
  // reaches the browser — the proxy already wrote it to an HttpOnly cookie.
  const applySession = useCallback(
    (session: SessionLike) => {
      ctx.setToken(session.token ?? null);
      ctx.setSessionId(session.sessionId ?? null);
      if (!cookieMode && session.refreshToken) {
        ctx.setRefreshToken(session.refreshToken);
      }
    },
    [cookieMode, ctx],
  );

  const signUp = useCallback(
    async (args: NativeAuthSignUpArgs) => {
      setIsLoading(true);
      try {
        const session = cookieMode
          ? await callProxy<NativeAuthSession>("signUp", args)
          : await signUpAction(args);
        applySession(session);
        return session;
      } finally {
        setIsLoading(false);
      }
    },
    [cookieMode, callProxy, signUpAction, applySession],
  );

  const signIn = useCallback(
    async (args: NativeAuthSignInArgs) => {
      setIsLoading(true);
      try {
        const session = cookieMode
          ? await callProxy<NativeAuthSession>("signIn", args)
          : await signInAction(args);
        applySession(session);
        return session;
      } finally {
        setIsLoading(false);
      }
    },
    [cookieMode, callProxy, signInAction, applySession],
  );

  const signInAnonymous = useCallback(
    async (args: { rememberMe?: boolean } = {}) => {
      if (!signInAnonymousAction) {
        throw new Error("Anonymous sign-in is not configured");
      }
      setIsLoading(true);
      try {
        const session = cookieMode
          ? await callProxy<NativeAuthSession>("signInAnonymous", args)
          : await signInAnonymousAction(args);
        applySession(session);
        return session;
      } finally {
        setIsLoading(false);
      }
    },
    [cookieMode, callProxy, signInAnonymousAction, applySession],
  );

  const linkAnonymousAccount = useCallback(
    async (args: { email: string; password: string; name?: string; image?: string }) => {
      if (!linkAnonymousAccountAction) {
        throw new Error("Anonymous account linking is not configured");
      }
      setIsLoading(true);
      try {
        const session = cookieMode
          ? await callProxy<NativeAuthSession>("linkAnonymousAccount", args)
          : await linkAnonymousAccountAction(args);
        applySession(session);
        return session;
      } finally {
        setIsLoading(false);
      }
    },
    [cookieMode, callProxy, linkAnonymousAccountAction, applySession],
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
        const result = cookieMode
          ? await callProxy<NativeAuthOAuthCallbackResult>("callback", args)
          : await client.action(ctx.callback, args);
        if ("token" in result) {
          ctx.setToken(result.token);
          ctx.setSessionId(result.sessionId);
          if (!cookieMode) {
            ctx.setRefreshToken(result.refreshToken);
          }
        }
        return result;
      } finally {
        setIsLoading(false);
      }
    },
    [client, cookieMode, callProxy, ctx],
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
        const result = cookieMode
          ? await callProxy<NativeAuthVerifyEmailOtpResult>("verifyEmailOtp", args)
          : await verifyEmailOtpAction(args);
        if ("token" in result && (cookieMode || "refreshToken" in result)) {
          ctx.setToken(result.token ?? null);
          ctx.setSessionId(result.sessionId ?? null);
          if (!cookieMode && result.refreshToken) {
            ctx.setRefreshToken(result.refreshToken);
          }
        }
        return result;
      } finally {
        setIsLoading(false);
      }
    },
    [cookieMode, callProxy, verifyEmailOtpAction, ctx],
  );
  const signOut = useCallback(
    async (args?: { callbackURL?: string }): Promise<NativeAuthSignOutResult> => {
      if (cookieMode) {
        // Cookie mode always proxies — only the server can clear HttpOnly
        // cookies — even when no access token is held in memory. Local state
        // clears regardless of the result so a proxy failure can't leave the
        // client half-authenticated while the cookies are gone.
        setIsLoading(true);
        try {
          return await callProxy<NativeAuthSignOutResult>("signOut", {
            callbackURL: args?.callbackURL,
          });
        } finally {
          ctx.setToken(null);
          ctx.setSessionId(null);
          ctx.setTwoFactorChallengeToken(null);
          setIsLoading(false);
        }
      }
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
    [cookieMode, callProxy, signOutAction, ctx],
  );

  const updateSession = useCallback(async () => {
    if (cookieMode) {
      setIsLoading(true);
      try {
        const session = await callProxy<NativeAuthSession>("updateSession", {});
        applySession(session);
        return session;
      } finally {
        setIsLoading(false);
      }
    }
    if (ctx.refreshToken === null) {
      throw new Error("No refresh token available");
    }
    setIsLoading(true);
    try {
      const session = await updateSessionAction({ refreshToken: ctx.refreshToken });
      applySession(session);
      return session;
    } finally {
      setIsLoading(false);
    }
  }, [cookieMode, callProxy, updateSessionAction, applySession, ctx]);

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

  const updateUser = useCallback(
    async (args: { name?: string; image?: string; metadataJson?: string }) => {
      if (ctx.token === null) {
        throw new Error("Session required to update user");
      }
      if (updateUserAction === null) {
        throw new Error("updateUser is not configured");
      }
      setIsLoading(true);
      try {
        return await updateUserAction({ ...args, token: ctx.token });
      } finally {
        setIsLoading(false);
      }
    },
    [ctx, updateUserAction],
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
            const session = cookieMode
              ? await callProxy<NativeAuthTwoFactorVerifyResult>("twoFactorVerifyTOTP", args)
              : await twoFactorVerifyTOTPAction(args);
            if (session.token) {
              ctx.setToken(session.token);
              ctx.setSessionId(session.sessionId ?? null);
              if (!cookieMode) {
                ctx.setRefreshToken(session.refreshToken ?? null);
              }
              ctx.setTwoFactorChallengeToken(null);
            }
            return session;
          }
        : notAvailable,
      verifyBackupCode: twoFactorVerifyBackupCodeAction
        ? async (args: NativeAuthTwoFactorVerifyArgs) => {
            const session = cookieMode
              ? await callProxy<NativeAuthTwoFactorVerifyResult>("twoFactorVerifyBackupCode", args)
              : await twoFactorVerifyBackupCodeAction(args);
            if (session.token) {
              ctx.setToken(session.token);
              ctx.setSessionId(session.sessionId ?? null);
              if (!cookieMode) {
                ctx.setRefreshToken(session.refreshToken ?? null);
              }
              ctx.setTwoFactorChallengeToken(null);
            }
            return session;
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
        ? async (args: { password: string }) => {
            if (ctx.token === null) {
              throw new Error("Session required to generate backup codes");
            }
            return await twoFactorGenerateBackupCodesAction({
              token: ctx.token,
              password: args.password,
            });
          }
        : notAvailable,
    };
  }, [
    ctx,
    cookieMode,
    callProxy,
    twoFactorEnableAction,
    twoFactorVerifyTOTPAction,
    twoFactorVerifyBackupCodeAction,
    twoFactorDisableAction,
    twoFactorGenerateBackupCodesAction,
  ]);

  const listSessions = useCallback(async () => {
    if (listSessionsAction === null || ctx.token === null) {
      throw new Error("Session listing is not configured");
    }
    return await listSessionsAction({ token: ctx.token });
  }, [listSessionsAction, ctx.token]);

  const revokeSession = useCallback(
    async (args: { sessionId: string }) => {
      if (revokeSessionAction === null || ctx.token === null) {
        throw new Error("Revoke session is not configured");
      }
      return await revokeSessionAction({ token: ctx.token, sessionId: args.sessionId });
    },
    [revokeSessionAction, ctx.token],
  );

  const revokeOtherSessions = useCallback(async () => {
    if (revokeOtherSessionsAction === null || ctx.token === null) {
      throw new Error("Revoke other sessions is not configured");
    }
    return await revokeOtherSessionsAction({ token: ctx.token });
  }, [revokeOtherSessionsAction, ctx.token]);

  const session = useQuery(
    ctx.verifySession,
    ctx.token ? { token: ctx.token, sessionId: ctx.sessionId ?? undefined } : "skip",
  );
  const isSessionLoading = ctx.token !== null && session === undefined;
  // While the live query resolves, fall back to the server-provided user so
  // the first paint is already authenticated (cookie mode no-flash). The
  // fallback only applies while a token exists — after sign-out the query
  // skips and the user must be null.
  const user =
    session === undefined
      ? ctx.token !== null
        ? (ctx.initialUser ?? null)
        : null
      : (session?.user ?? null);
  const sessionId = session?.sessionId ?? ctx.sessionId;

  return {
    signUp,
    signIn,
    signInAnonymous,
    linkAnonymousAccount,
    signInWithMagicLink,
    signInWithRedirect,
    oauthCallback,
    signInWithEmailOtp,
    sendVerificationOtp,
    changeEmail,
    verifyEmailOtp,
    signOut,
    updateSession,
    updateUser,
    listSessions,
    revokeSession,
    revokeOtherSessions,
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
    twoFactorChallengeToken: ctx.twoFactorChallengeToken,
    setTwoFactorChallengeToken: ctx.setTwoFactorChallengeToken,
    user,
    sessionId,
    setSessionId: ctx.setSessionId,
    isLoading: isLoading || isSessionLoading,
    isAuthenticated: user !== null,
    storageMode: ctx.storageMode,
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
  const isLoading = ctx.token !== null && (session === undefined || !ctx.isAuthReady);
  const user =
    session === undefined
      ? ctx.token !== null
        ? (ctx.initialUser ?? null)
        : null
      : (session?.user ?? null);
  return {
    user,
    sessionId: session?.sessionId ?? null,
    isLoading,
    isAuthenticated: user !== null && ctx.isAuthReady,
  };
}

export function useUser(): NativeAuthUser | null {
  const { user } = useSession();
  return user;
}
