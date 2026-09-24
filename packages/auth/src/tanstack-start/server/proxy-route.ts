import { proxyAuthActionToConvex } from "../../ssr/proxy.js";
import { convexHttpTransport } from "../../ssr/transport.js";
import type { ConvexAuthTanstackStartOptions } from "./middleware.js";

/**
 * Handler for mounting the auth proxy as a TanStack Start server route —
 * the alternative to the middleware intercept when you'd rather own the
 * route file explicitly:
 *
 * ```ts
 * // src/routes/api/auth.ts
 * import { createFileRoute } from "@tanstack/react-router";
 * import { convexAuthProxyHandler } from "@vortex-api/convex-auth/tanstack-start/server";
 * import { api } from "../../convex/_generated/api";
 *
 * const handler = convexAuthProxyHandler({ actions: api.auth });
 *
 * export const Route = createFileRoute("/api/auth")({
 *   server: { handlers: { POST: ({ request }) => handler(request) } },
 * });
 * ```
 *
 * When `convexAuthRequestMiddleware` is registered it already intercepts
 * `apiRoute` POSTs — mount this only if you are not using the middleware.
 */
export function convexAuthProxyHandler(options: ConvexAuthTanstackStartOptions) {
  const transport = options.transport ?? convexHttpTransport(options.convexUrl);
  return (request: Request): Promise<Response> =>
    proxyAuthActionToConvex(request, {
      actions: options.actions,
      transport,
      cookieConfig: options.cookieConfig,
      verbose: options.verbose,
      convexUrl: options.convexUrl,
    });
}
