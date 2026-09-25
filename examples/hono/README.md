# Hono example — `@vortex-api/convex-auth/hono`

Minimal Hono app using the packaged server adapter: same-origin HttpOnly
cookie sessions, `/api/auth` proxy, and the verified session oracle.

## Run

```bash
pnpm install
# point the app at your Convex deployment
cp .env.example .env.local   # or set CONVEX_URL
pnpm run dev
```

`CONVEX_URL` must be set (e.g. `https://<your-deployment>.convex.cloud`).

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
