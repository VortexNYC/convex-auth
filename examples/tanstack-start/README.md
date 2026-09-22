# TanStack Start SSR demo

Exercises `@vortex-api/convex-auth/tanstack-start` end-to-end: HttpOnly
cookie sessions, request-middleware refresh, the `/api/auth` proxy, and
server-rendered session state — no refresh token ever touches browser
JavaScript.

## What runs where

| Piece              | File                              | Role                                                                                          |
| ------------------ | --------------------------------- | --------------------------------------------------------------------------------------------- |
| Request middleware | `src/start.ts`                    | `convexAuthRequestMiddleware` — CORS strip, session landing, proactive refresh, `/api/auth` proxy |
| Server session     | `src/lib/auth-server.ts`          | `getAuthServerState` (seeds client) + `getConvexAuthSession` (verified, revocation-aware)       |
| Root provider      | `src/routes/__root.tsx`           | `beforeLoad` resolves server state → `ConvexAuthTanstackStartProvider` (cookie mode)            |
| Route guard        | `src/routes/_authed.tsx`          | `beforeLoad` UX guard reading `context.auth` — **not** the security boundary                    |
| Protected serverFn | `src/routes/_authed/dashboard.tsx` | `convexAuthFunctionMiddleware` attaches `context.session` — the real authorization boundary    |
| Sign-in            | `src/routes/sign-in.tsx`          | email+password and anonymous — all mint through the proxy                                     |

## Setup

```bash
cd examples/tanstack-start

# 1. Start the local Convex backend (anonymous deployment, port 3212)
pnpm dlx convex dev

# 2. In another shell, generate + set the JWT env vars (first run only)
#    — see docs/(operations)/production.mdx for the jose keygen snippet
pnpm dlx convex env set JWT_PRIVATE_KEY '<private-jwk-json>'
pnpm dlx convex env set JWKS '{"keys":[<public-jwk>]}'
pnpm dlx convex env set SITE_URL 'http://localhost:3200'

# 3. Start the app
pnpm dev
```

Then open http://localhost:3200 — sign in anonymously or with email, hit
`/dashboard`, sign out, and watch cookies rotate in devtools.

## Security contract exercised

- `POST /api/auth` is intent-based (`{intent, args}`) — no REST subpaths.
- Credentialed requests without `Origin`/`Referer` → 403.
- Cross-origin requests → 403, and auth cookies are stripped downstream.
- `GET /api/auth` → 405.
- `beforeLoad` guards are navigation UX only; `convexAuthFunctionMiddleware`
  re-verifies the session (revocation included) on every protected call.
