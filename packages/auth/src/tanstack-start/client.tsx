import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ConvexAuthProvider, type NativeAuthActions } from "../react/ConvexAuthProvider.js";
import type { ConvexAuthServerState } from "./server/state.js";

/**
 * Cookie-mode auth provider for TanStack Start. Render it in your root route
 * (`__root.tsx`) with the server state resolved by `getAuthServerState` —
 * typically via the root route's `beforeLoad`/`loader`:
 *
 * ```tsx
 * export const Route = createRootRoute({
 *   beforeLoad: async () => ({
 *     auth: await getAuthServerState(getRequest(), { actions: api.auth }),
 *   }),
 *   component: RootComponent,
 * });
 * ```
 *
 * The session lives in HttpOnly cookies; session-minting writes POST to the
 * proxy (`apiRoute`); the refresh token never reaches JavaScript. Auth
 * transitions call `router.invalidate()` so route guards re-run.
 */
export function ConvexAuthTanstackStartProvider(props: {
  /**
   * Output of `getAuthServerState(request, { actions })` for this render —
   * re-delivered on each SSR pass so a boundary-rotated session reaches the
   * mounted client.
   */
  serverState: ConvexAuthServerState;
  /**
   * The `auth` export from your `convex/auth.ts` — `api.auth`. Passed
   * directly (unlike Next.js there's no RSC boundary to serialize across).
   */
  actions: NativeAuthActions;
  /**
   * Must match the `apiRoute` option of `convexAuthRequestMiddleware` /
   * `convexAuthProxyHandler`. Defaults to `/api/auth`.
   */
  apiRoute?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <ConvexAuthProvider
      actions={props.actions}
      storageMode="cookies"
      apiRoute={props.apiRoute}
      serverState={props.serverState}
      onAuthChange={() => router.invalidate()}
    >
      {props.children}
    </ConvexAuthProvider>
  );
}
