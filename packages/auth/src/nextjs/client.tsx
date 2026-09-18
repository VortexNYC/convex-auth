"use client";

import { ReactNode } from "react";
import {
  ConvexAuthProvider,
  type NativeAuthActions,
  type NativeAuthUser,
} from "../react/ConvexAuthProvider.js";
import { invalidateAuthRouterCache } from "./server/invalidateCache.js";

export type ConvexAuthServerState = {
  token: string | null;
  /**
   * Always `null` — the refresh token never reaches the browser. It lives in
   * an HttpOnly cookie and the adapter's proxy substitutes it server-side.
   */
  refreshToken: null;
  user: NativeAuthUser | null;
  sessionId: string | null;
  _timeFetched: number;
};

/**
 * Client half of `ConvexAuthNextjsServerProvider`. Renders
 * `ConvexAuthProvider` in cookie mode: the session lives in HttpOnly cookies,
 * session-minting writes POST to the proxy endpoint, and the refresh token
 * never reaches JavaScript.
 */
export function ConvexAuthNextjsClientProvider(props: {
  serverState: ConvexAuthServerState;
  actions: NativeAuthActions;
  apiRoute?: string;
  verbose?: boolean;
  children: ReactNode;
}) {
  const { serverState, actions, apiRoute, children } = props;
  return (
    <ConvexAuthProvider
      actions={actions}
      storageMode="cookies"
      apiRoute={apiRoute}
      initialToken={serverState.token}
      initialSessionId={serverState.sessionId}
      initialUser={serverState.user}
      onAuthChange={invalidateAuthRouterCache}
    >
      {children}
    </ConvexAuthProvider>
  );
}
