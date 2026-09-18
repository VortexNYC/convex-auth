"use client";

import { ReactNode } from "react";
import {
  ConvexAuthProvider,
  type NativeAuthActions,
  type NativeAuthUser,
} from "../react/ConvexAuthProvider.js";
import { invalidateAuthRouterCache } from "./server/invalidateCache.js";
import type { SerializedAuthActions } from "./serialization.js";

// Rebuilds FunctionReferences from the serialized manifest. Symbol.for is
// global, so a ref rebuilt here reads identically to one the `api` proxy
// fabricates. Iterates entries rather than a fixed key list so no runtime
// module is shared across the server→client boundary (see serialization.ts).
const functionNameSymbol = Symbol.for("functionName");

export function normalizeAuthActions(
  actions: SerializedAuthActions | NativeAuthActions,
): NativeAuthActions {
  if (typeof (actions as SerializedAuthActions).signUp !== "string") {
    return actions as NativeAuthActions;
  }
  const live: Record<string, { [key: symbol]: string }> = {};
  for (const [key, name] of Object.entries(actions)) {
    if (typeof name === "string") {
      live[key] = { [functionNameSymbol]: name };
    }
  }
  return live as NativeAuthActions;
}

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
  /**
   * `api.auth` arrives serialized across the server→client boundary — live
   * references (a Proxy with Symbol-keyed names) can't survive Flight. Pass
   * the manifest from `serializeAuthActions`; direct client-tree usage may
   * pass live references instead.
   */
  actions: SerializedAuthActions | NativeAuthActions;
  apiRoute?: string;
  children: ReactNode;
}) {
  const { serverState, apiRoute, children } = props;
  const actions = normalizeAuthActions(props.actions);
  return (
    <ConvexAuthProvider
      actions={actions}
      storageMode="cookies"
      apiRoute={apiRoute}
      serverState={serverState}
      onAuthChange={invalidateAuthRouterCache}
    >
      {children}
    </ConvexAuthProvider>
  );
}
