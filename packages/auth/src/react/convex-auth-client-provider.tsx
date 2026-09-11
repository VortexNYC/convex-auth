import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { AuthRuntimeStatus } from "../core";
import { AuthRuntimeProvider } from "./AuthRuntimeProvider";
import { ConvexAuthProvider, useSession, type ConvexAuthProviderProps } from "./ConvexAuthProvider";
import type { ConvexBetterAuthClient } from "./auth-client-types";
import { useConvexAuthClient } from "./convex-auth-client";
import { DEFAULT_AUTH_RUNTIME_STATUS } from "./types";

const ConvexAuthClientContext = createContext<ConvexBetterAuthClient | null>(null);

/**
 * Provides the native Convex `ConvexBetterAuthClient`-shaped client to
 * descendants via context. This lets pages and forms drop the `authClient`
 * prop and use `useConvexAuthClientContext()` instead.
 *
 * The client is built from `useConvexAuthClient`, so this provider must be
 * rendered inside a `ConvexProvider` (from `convex/react`) — or you can use
 * `ConvexAuthClientProvider` which wraps `ConvexAuthProvider`.
 */
export function ConvexAuthClientContextProvider(args: { children: ReactNode }) {
  const client = useConvexAuthClient();
  return (
    <ConvexAuthClientContext.Provider value={client}>
      {args.children}
    </ConvexAuthClientContext.Provider>
  );
}

/**
 * Returns the client from a parent `ConvexAuthClientContextProvider`, or
 * `null` if none exists. This allows components to work both under the native
 * runtime (no `authClient` prop needed) and under the legacy Better Auth
 * runtime (where the prop is passed explicitly).
 */
export function useConvexAuthClientContext(): ConvexBetterAuthClient | null {
  return useContext(ConvexAuthClientContext);
}

/**
 * Convenience provider that combines `ConvexAuthProvider` (native session /
 * token management) with `ConvexAuthClientContextProvider` (client object).
 *
 * Render this inside a `ConvexProvider` from `convex/react`.
 */
function ConvexAuthClientRuntimeProvider(props: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useSession();
  const status = useMemo<AuthRuntimeStatus>(() => {
    if (isAuthenticated) {
      return {
        ...DEFAULT_AUTH_RUNTIME_STATUS,
        state: "convexReady",
        providerAuthenticated: true,
        tokenAvailable: true,
        convexAuthenticated: true,
      };
    }
    if (isLoading) {
      return { ...DEFAULT_AUTH_RUNTIME_STATUS, state: "convexConnecting" };
    }
    return DEFAULT_AUTH_RUNTIME_STATUS;
  }, [isAuthenticated, isLoading]);

  return (
    <AuthRuntimeProvider status={status}>
      <ConvexAuthClientContextProvider>{props.children}</ConvexAuthClientContextProvider>
    </AuthRuntimeProvider>
  );
}

export function ConvexAuthClientProvider(args: ConvexAuthProviderProps) {
  const { children, ...providerProps } = args;
  return (
    <ConvexAuthProvider {...providerProps}>
      <ConvexAuthClientRuntimeProvider>{children}</ConvexAuthClientRuntimeProvider>
    </ConvexAuthProvider>
  );
}
