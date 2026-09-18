# Next.js SSR demo

Exercises `@vortex-api/convex-auth/nextjs` end-to-end: HttpOnly cookie
sessions, middleware refresh, the `/api/auth` proxy, and server-rendered
session state — no token ever touches browser JavaScript.

## What runs where

| Piece | File | Role |
| --- | --- | --- |
| Middleware | `middleware.ts` | CORS strip, session-triple landing, proactive refresh, `/api/auth` proxy, route protection for `/dashboard` |
| Server provider | `app/layout.tsx` | `ConvexAuthNextjsServerProvider` verifies the session per RSC render and seeds the client |
| Server check | `app/page.tsx`, `app/dashboard/page.tsx` | `convexAuthNextjsSession()` — revocation-aware, `cache()`-memoized per render pass |
| Client session | `app/dashboard/client-panel.tsx` | `useSession()` first-paints authenticated from server state |
| Sign-in | `app/sign-in/page.tsx` | email+password, OAuth, guest, passkey, 2FA — all mint through the proxy |
| Sign-out | `app/dashboard/sign-out-button.tsx` | POSTs through the proxy so HttpOnly cookies clear server-side |

## Setup

```bash
# 1. Start the Convex backend (creates a dev deployment, writes .env.local)
cd examples/nextjs
pnpm dlx convex dev
```

`convex dev` pushes `convex/` and prompts for `JWT_PRIVATE_KEY`/`JWKS`
generation. Set the app origin so OAuth/magic-link redirects land back on
Next:

```bash
pnpm dlx convex env set SITE_URL http://localhost:3000
# optional: return email tokens in responses for local testing
pnpm dlx convex env set ALLOW_EMAIL_TOKEN_FALLBACK true
```

```bash
# 2. Run Next.js
pnpm dev
```

Open http://localhost:3000 — signed-out home renders on the server, sign in,
`/dashboard` verifies server-side and shows the same session client-side via
`useSession()`.

## Cookie model

`__Host-__convexAuthToken` / `__Host-__convexAuthRefreshToken` (unprefixed on
localhost), plus `__convexAuthTwoFactorPending` and
`__convexAuthTrustedDevice` — all HttpOnly, `SameSite=Lax`, `Path=/`. The
refresh token and 2FA pending challenge never reach JavaScript; the proxy
substitutes them server-side.
