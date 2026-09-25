# Hono example — `@vortex-api/convex-auth/hono`

Minimal Hono app using the packaged server adapter: same-origin HttpOnly
cookie sessions, `/api/auth` proxy, and the verified session oracle.

## Run

```bash
pnpm install
# point the app at your Convex deployment
echo 'CONVEX_URL=https://<your-deployment>.convex.cloud' > .env.local
pnpm run dev
```

## What it shows

- `convexAuthMiddleware({ actions: api.auth })` on `app.use("*")` —
  intercepts `POST /api/auth`, lands session triples on navigations,
  rotates near-expiry tokens onto downstream responses, strips auth
  cookies from cross-origin requests.
- `getConvexAuthSession(c, { actions: api.auth })` in `/me` — a
  revocation-aware verified session for route guards.
- `convex/convex.config.ts` + `convex/auth.ts` + `convex/http.ts` — the
  standard consumer wiring (component mount, `convexAuth`, HTTP routes).

Prefer token mode (mobile/SPA, cross-origin APIs)? See `examples/server`
for the manual `ConvexHttpClient` pattern this package builds on.
