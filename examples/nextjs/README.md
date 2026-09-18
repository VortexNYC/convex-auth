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

Two backend options — a throwaway local deployment (no cloud project needed)
or your own cloud dev deployment.

### Option A — local anonymous backend

```bash
cd examples/nextjs
pnpm dlx convex dev --dev-deployment local
```

This starts a local Convex backend on `127.0.0.1:3210` and writes
`.env.local` with `CONVEX_DEPLOYMENT=anonymous:<name>` and
`NEXT_PUBLIC_CONVEX_URL`. The first push will fail demanding
`JWT_PRIVATE_KEY` and `JWKS` — generate an RS256 pair and set them:

```bash
# run from repo root — packages/auth has jose installed
cd ../../packages/auth
node -e '
  const jose = require("jose");
  jose.generateKeyPair("RS256", { extractable: true }).then(async ({ privateKey, publicKey }) => {
    const priv = await jose.exportJWK(privateKey);
    const pub = await jose.exportJWK(publicKey);
    pub.kid = priv.kid;
    console.log("JWT_PRIVATE_KEY=" + JSON.stringify(priv));
    console.log("JWKS=" + JSON.stringify({ keys: [pub] }));
  });
'
```

Paste each printed value into `convex env set` (run from `examples/nextjs`):

```bash
cd ../../examples/nextjs
pnpm dlx convex env set JWT_PRIVATE_KEY '<private-jwk-json>'
pnpm dlx convex env set JWKS '{"keys":[<public-jwk-json>]}'
pnpm dlx convex env set SITE_URL http://localhost:3000
pnpm dlx convex env set ALLOW_EMAIL_TOKEN_FALLBACK true
pnpm dlx convex dev --dev-deployment local   # leave running — pushes convex/
```

### Option B — cloud dev deployment

```bash
pnpm dlx convex dev   # creates/links a cloud project, writes .env.local
```

Then set the same env vars on the deployment (`JWT_PRIVATE_KEY`, `JWKS`,
`SITE_URL`, optionally `ALLOW_EMAIL_TOKEN_FALLBACK`).

### Run the app

```bash
pnpm dev   # http://localhost:3000
```

Signed-out home renders on the server, sign in, `/dashboard` verifies
server-side and shows the same session client-side via `useSession()`.

## Cookie model

`__Host-__convexAuthToken` / `__Host-__convexAuthRefreshToken` (unprefixed on
localhost), plus `__convexAuthTwoFactorPending` and
`__convexAuthTrustedDevice` — all HttpOnly, `SameSite=Lax`, `Path=/`. The
refresh token and 2FA pending challenge never reach JavaScript; the proxy
substitutes them server-side.
