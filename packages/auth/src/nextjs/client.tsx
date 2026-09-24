"use client";

import { ReactNode, useMemo } from "react";
import {
  ConvexAuthProvider,
  type NativeAuthActions,
  type NativeAuthUser,
} from "../react/ConvexAuthProvider.js";
import { invalidateAuthRouterCache } from "./server/invalidateCache.js";
import type { SerializedAuthActions } from "./serialization.js";

const functionNameSymbol = Symbol.for("functionName");

/**
 * Rebuilds FunctionReferences from the serialized manifest. Symbol.for is
 * global, so a ref rebuilt here reads identically to one the `api` proxy
 * fabricates. Iterates entries rather than a fixed key list so no runtime
 * module is shared across the server→client boundary (see serialization.ts).
 *
 * Manifests hold only string values; live action objects hold only
 * FunctionReferences. Any string value means we received a manifest —
 * including partial ones, which must still be rebuilt rather than passed
 * through as "live" (a pass-through would leave string values where the
 * provider expects refs and crash downstream).
 */
export function normalizeAuthActions(
  actions: SerializedAuthActions | NativeAuthActions,
): NativeAuthActions {
  if (!Object.values(actions).some((v) => typeof v === "string")) {
    return actions as NativeAuthActions;
  }
  /** Null-prototype so a `__proto__`/`constructor` key in a hand-built
   * manifest lands as data, not as a prototype write. */
  const live: Record<string, { [key: symbol]: string }> = Object.create(null);
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
  /** Memoized — a fresh refs object every render would bust
   * ConvexAuthProvider's own memoization on `actions`. */
  const actions = useMemo(() => normalizeAuthActions(props.actions), [props.actions]);
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
