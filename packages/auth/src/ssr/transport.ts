import { ConvexHttpClient } from "convex/browser";
import type { FunctionReference } from "convex/server";

/**
 * How an adapter calls the component over HTTP transport. Next.js supplies
 * `convex/nextjs` `fetchQuery`/`fetchAction`; every other adapter uses
 * `convexHttpTransport` (a `ConvexHttpClient`) below.
 */
export type AuthTransport = {
  query: (
    fn: FunctionReference<"query", "public">,
    args: Record<string, unknown>,
    opts?: { token?: string },
  ) => Promise<unknown>;
  action: (
    fn: FunctionReference<"action", "public">,
    args: Record<string, unknown>,
    opts?: { token?: string },
  ) => Promise<unknown>;
};

/**
 * Vite-style env object (TanStack Start, Vite SSR). Vite replaces the
 * `import.meta.env` expression with the full env object at build time, so
 * dynamic key access works; in non-Vite runtimes it's `undefined`.
 */
function bundlerEnv(key: string): string | undefined {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.[key];
}

/**
 * Resolve the Convex deployment URL for an adapter. Server-side env vars
 * only — this module is imported from the adapters' server entries.
 * `convexUrl` in options always wins.
 */
export function resolveConvexUrl(convexUrl?: string): string {
  const url =
    convexUrl ??
    process.env.CONVEX_URL ??
    bundlerEnv("CONVEX_URL") ??
    process.env.VITE_CONVEX_URL ??
    bundlerEnv("VITE_CONVEX_URL") ??
    process.env.NEXT_PUBLIC_CONVEX_URL;
  if (url === undefined) {
    throw new Error(
      "No Convex deployment URL. Pass `convexUrl` or set CONVEX_URL (or VITE_CONVEX_URL / NEXT_PUBLIC_CONVEX_URL).",
    );
  }
  return url;
}

/**
 * `ConvexHttpClient`-backed transport for adapters that don't have a
 * framework-specific Convex helper. A fresh client per call — `setAuth`
 * mutates client state, so sharing one would leak tokens across requests
 * (this matches `convex/nextjs`, which instantiates per call too).
 */
export function convexHttpTransport(convexUrl?: string): AuthTransport {
  const url = resolveConvexUrl(convexUrl);
  const client = (token?: string) => {
    const c = new ConvexHttpClient(url);
    if (token !== undefined) {
      c.setAuth(token);
    }
    return c;
  };
  return {
    query: (fn, args, opts) => client(opts?.token).query(fn, args),
    action: (fn, args, opts) => client(opts?.token).action(fn, args),
  };
}
