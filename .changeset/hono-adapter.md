---
"@vortex-api/convex-auth": minor
---

Add the Hono server adapter — `@vortex-api/convex-auth/hono`.

`convexAuthMiddleware` is the whole server surface in one `app.use("*")`: it proxies `POST /api/auth` auth intents, lands OAuth/magic-link session triples as HttpOnly cookies, rotates near-expiry tokens onto downstream responses (rebuilding immutable responses when needed), and strips auth cookies from cross-origin requests. `convexAuthProxyHandler` mounts the proxy as an explicit route instead. Session helpers (`getConvexAuthSession`, `getConvexAuthToken`, `convexAuthCookieState`, `getAuthServerState`) take the Hono context and are rotation- and revocation-aware. Works on `@hono/node-server`, Bun, Deno, and any fetch-runtime Hono supports. `hono` is an optional peer (`>=4`); the adapter is type-only against it.

The request-scoped session bookkeeping (rotation overrides, CORS-strip tracking, `verifySession` memoization) moved from the TanStack adapter into the shared `ssr/` substrate — it was already framework-agnostic; `./tanstack-start/server` re-exports it unchanged.
