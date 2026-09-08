import {
  ConvexAuthProvider,
  useAuthActions,
  type NativeAuthActions,
  type TokenStorage,
} from "../react/client";
import { useEffect, useMemo, useState, type ReactNode } from "react";

export type ExpoConvexAuthStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  getItemAsync?: (key: string) => Promise<string | null | undefined>;
  setItemAsync?: (key: string, value: string) => Promise<void>;
  deleteItem?: (key: string) => void;
  deleteItemAsync?: (key: string) => Promise<void>;
};

const TOKEN_KEY = "convex-auth-token";
const REFRESH_TOKEN_KEY = "convex-auth-refresh-token";
const SESSION_ID_KEY = "convex-auth-session-id";

function createExpoTokenStorage(storage: ExpoConvexAuthStorage, prefix = ""): TokenStorage {
  const withPrefix = (key: string) => (prefix ? `${prefix}:${key}` : key);
  return {
    get: (key) => storage.getItem(withPrefix(key)) ?? null,
    set: (key, value) => {
      const fullKey = withPrefix(key);
      storage.setItem(fullKey, value);
      void storage.setItemAsync?.(fullKey, value);
    },
    remove: (key) => {
      const fullKey = withPrefix(key);
      storage.deleteItem?.(fullKey);
      void storage.deleteItemAsync?.(fullKey);
    },
  };
}

function parseAuthUrl(url: string): {
  token: string | null;
  refreshToken: string | null;
  sessionId: string | null;
} {
  const searchIndex = url.indexOf("?");
  const search = searchIndex >= 0 ? url.slice(searchIndex + 1) : "";
  const params = new URLSearchParams(search);
  return {
    token: params.get("token"),
    refreshToken: params.get("refreshToken"),
    sessionId: params.get("sessionId"),
  };
}

export type ExpoConvexAuthProviderProps = {
  actions: NativeAuthActions;
  children: ReactNode;
  storage: ExpoConvexAuthStorage;
  storagePrefix?: string;
  initialUrl?: string | null;
  subscribeToUrl?: (handler: (url: string) => void) => () => void;
};

export function ExpoConvexAuthProvider(props: ExpoConvexAuthProviderProps) {
  const tokenStorage = useMemo(
    () => createExpoTokenStorage(props.storage, props.storagePrefix),
    [props.storage, props.storagePrefix],
  );

  const [initial, setInitial] = useState<{
    token: string;
    refreshToken: string | null;
    sessionId: string | null;
  } | null>(null);

  useEffect(() => {
    if (!props.initialUrl) {
      setInitial(null);
      return;
    }
    const parsed = parseAuthUrl(props.initialUrl);
    if (parsed.token) {
      setInitial({
        token: parsed.token,
        refreshToken: parsed.refreshToken,
        sessionId: parsed.sessionId,
      });
    } else {
      setInitial(null);
    }
  }, [props.initialUrl]);

  return (
    <ConvexAuthProvider
      actions={props.actions}
      storage={tokenStorage}
      initialToken={initial?.token ?? null}
      initialRefreshToken={initial?.refreshToken ?? null}
      initialSessionId={initial?.sessionId ?? null}
    >
      <ExpoDeepLinkHandler subscribeToUrl={props.subscribeToUrl} />
      {props.children}
    </ConvexAuthProvider>
  );
}

function ExpoDeepLinkHandler(props: {
  subscribeToUrl?: (handler: (url: string) => void) => () => void;
}) {
  const auth = useAuthActions();

  useEffect(() => {
    if (!props.subscribeToUrl) return;
    return props.subscribeToUrl((url) => {
      const parsed = parseAuthUrl(url);
      if (parsed.token) {
        auth.setToken(parsed.token);
        auth.setRefreshToken(parsed.refreshToken ?? null);
        auth.setSessionId(parsed.sessionId ?? null);
      }
    });
  }, [props.subscribeToUrl, auth]);

  return null;
}

export { ConvexAuthProvider, useAuthActions, TOKEN_KEY, REFRESH_TOKEN_KEY, SESSION_ID_KEY };

export type { NativeAuthActions, TokenStorage };
