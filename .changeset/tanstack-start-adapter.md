---
"@vortex-api/convex-auth": minor
---

Add TanStack Start SSR adapter (`@vortex-api/convex-auth/tanstack-start` + `/tanstack-start/server`)

The second framework adapter implementing the SSR contract: app-origin
HttpOnly cookie sessions with a server-confidential refresh token, an
intent-based `/api/auth` proxy, and revocation-aware verified sessions.

- `convexAuthRequestMiddleware({ actions })` — global request middleware
  for `createStart`: CORS cookie stripping, session-triple landing,
  proactive `updateSession` refresh, and the `/api/auth` proxy
- `convexAuthFunctionMiddleware({ actions })` — `createServerFn`
  middleware attaching the verified session to `context.session`
- `getAuthServerState` / `getConvexAuthSession` / `getConvexAuthToken` /
  `convexAuthCookieState` — request-scoped session helpers (verified,
  revocation-aware, memoized per request)
- `convexAuthProxyRoute` — standalone server-route handler for apps that
  mount the proxy outside request middleware
- `ConvexAuthTanstackStartProvider` — cookie-mode client provider
  consuming `serverState` resolved on the server

Shared internals were extracted into a framework-neutral `src/ssr/` core
(fetch-shaped `Request`→`Response` pipeline, cookie schema, boundary
refresh) that the Next.js adapter also builds on. Includes a runnable
`examples/tanstack-start` demo.
