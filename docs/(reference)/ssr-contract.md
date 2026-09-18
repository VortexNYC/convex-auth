# SSR auth contract

Design contract for server-side-rendering integrations (Next.js, TanStack
Start, and any future framework adapter). This document is the spec an adapter
must satisfy — it is framework-neutral on purpose, so each adapter stays a thin
shell over shared semantics.

Status: draft. No adapter code has been written from this contract yet.

## What the three references establish

### Upstream `@convex-dev/auth` (`src/nextjs/`)

Ships `@convex-dev/auth/nextjs` + `/nextjs/server`. Three pieces:

| Piece                                           | Responsibility                                                                                                                                                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Middleware                                      | CORS validation → refresh expired tokens server-side → OAuth/magic-link `code` exchange on GET navigations → set auth cookies on the response                                                             |
| RSC provider (`ConvexAuthNextjsServerProvider`) | Reads the token cookie, passes `{ token, refreshToken: "dummy" }` into the client provider. **The refresh token never reaches the browser.**                                                              |
| `/api/auth` proxy (`proxyAuthActionToConvex`)   | Client POSTs `{ action, args }`. Allowlist: `auth:signIn`, `auth:signOut` only. For refresh, the server substitutes the real `refreshToken` from the cookie before calling Convex. Response sets cookies. |

Server-side verification is **DB-backed, not local JWT verify**:
`isAuthenticatedNextjs()` → `fetchQuery("auth:isAuthenticated")` over
`convex/nextjs` HTTP transport. Middleware keeps cookies fresh; anything that
needs a real answer asks the component.

Their `test-router` example (TanStack Router) is minimal: provider at root +
`<Authenticated>` render gates + manual redirects. No `beforeLoad` guards — our
`examples/tanstack-router` (PR #341) is already ahead of theirs on the client
half.

### What Next.js 16 expects from an auth library

From the official authentication guide:

- **`proxy.ts`** (middleware, renamed in 16): **optimistic checks only** — read
  the cookie, never hit the DB. Runs on every route _including prefetches_, so
  any DB call here is a performance bug. Used for redirect pre-filtering and
  protecting static routes.
- **DAL** (`verifySession()` + React `cache()`): the real check, invoked close
  to the data source in Server Components, Server Actions, and Route Handlers.
  `cache()` dedupes per render pass.
- **Server Actions / Route Handlers**: treated as public API endpoints — each
  verifies the session itself.
- **No layout-level gating**: layouts don't re-render on navigation and don't
  prevent child segments from rendering. Auth checks belong at the data or leaf
  level.
- **`cookies()` API**: `HttpOnly`, `Secure`, `SameSite`, bounded `Max-Age`.
- **`taintUniqueValue`** to keep sensitive session fields off the client.

### What TanStack Start expects

From the official authentication + server-primitives guides:

- **`createServerFn` + `createMiddleware`**: session lookup is a typed
  middleware that attaches `context.session`; protected server functions
  declare `.middleware([authMiddleware])`. **The server function is the
  security boundary — `beforeLoad` is UX only.**
- **Cookies**: `__Host-` prefix convention, `HttpOnly`, `Secure`,
  `SameSite=Lax`, bounded `Max-Age`, rotation on login. Read via
  `getRequestHeader('cookie')`, set via `setResponseHeader('Set-Cookie')`.
- **Root route `beforeLoad`** loads the user into route context; `_authed`
  layout routes guard children; `router.invalidate()` re-runs guards after
  auth changes.
- **`Cache-Control: private, no-store`** on any route that renders
  session-specific data.
- OAuth: state + PKCE verifier in a short-lived cookie keyed to the attempt.
- Timing equalization (dummy-hash verify on unknown user) — already in our
  runtime.

### Shared doctrine across all three

1. **Two check tiers**: optimistic (cookie-present, no DB) at the request
   boundary; verified (DB) at the data boundary.
2. **Refresh token is server-confidential** in SSR mode. The browser gets the
   access token and a cookie; rotation happens behind the cookie.
3. **Server-side data access uses the HTTP transport** (`convex/nextjs`
   `fetchQuery`/`fetchAction`, or `ConvexHttpClient`), not a websocket.
4. **Route guards are UX, not security.** Every adapter must state this.

## The contract

Any adapter named `convex-auth/<framework>` must implement these six pieces.

### 1. Cookie schema

Three `HttpOnly; Secure; SameSite=Lax; Path=/` cookies, `__Host-` prefixed in
production:

| Cookie                        | Contents                                         | Lifetime                     |
| ----------------------------- | ------------------------------------------------ | ---------------------------- |
| `__Host-convex-auth-token`    | Session JWT (access token)                       | JWT lifetime                 |
| `__Host-convex-auth-refresh`  | Opaque refresh token                             | Refresh TTL                  |
| `__Host-convex-auth-verifier` | PKCE verifier, only during OAuth/magic-link flow | Minutes, deleted on exchange |

The refresh token MUST NOT be exposed to JavaScript. In SSR mode the client
provider never holds it (see §5).

### 2. Optimistic session resolution

A request-boundary helper that reads the token cookie and returns a cheap
verdict: `{ hasSessionCookie: boolean, tokenExpired: boolean }` — JWT `exp`
decode only, **no Convex call**. Feeds redirect pre-filtering (Next `proxy.ts`,
Start `beforeLoad`, middleware). Must document that this verdict is not
authorization.

### 3. Verified session resolution

A server helper that calls a component query over HTTP transport:

- `fetchQuery(componentAuth.isSessionActive, { token })` — returns whether the
  session exists, is unrevoked, and is unexpired. Our sessions are DB-primary
  (`authSessions.revokedAt`), so JWT-valid-but-revoked MUST resolve to false.
- Adapter memoizes per request (React `cache()` on Next; request-scoped
  middleware context on Start).

### 4. Boundary refresh + code exchange

At the request boundary (before rendering):

1. If token cookie missing/expired and refresh cookie present → call the
   component's session-update action with the refresh token → write the new
   `{token, refreshToken}` pair to response cookies.
2. On GET navigations carrying a `code` param → exchange via the component's
   sign-in action (with the verifier cookie for PKCE) → set cookies → redirect
   with the param stripped.

This is where our **family rotation** semantics apply: rotation updates the
family head; a refresh token that's already been rotated is replay, and the
component revokes the family. The adapter MUST serialize refreshes per cookie
pair (see "Refresh races" below) rather than retry-and-hope.

### 5. Auth-action proxy

An endpoint the client provider POSTs to for session-mutating actions. On the
server it:

- Rejects non-POST and cross-origin requests.
- Enforces an **action allowlist** — see below.
- Substitutes the real `refreshToken` from the cookie (the client sends a
  placeholder).
- Forwards to the component action over HTTP transport, writes result cookies
  on the response.

Upstream allowlists `signIn`/`signOut`. Ours must additionally cover, at
minimum: two-factor challenge resolution, passkey assertion completion, and
email/phone verification that mints a session — because all of these produce a
session that must land in cookies. Design principle: the allowlist enumerates
_session-minting_ actions; profile/org/api-key mutations stay client-direct
with the access token.

### 6. Cookie-mode client provider

`ConvexAuthProvider` gains a storage mode (working name:
`storage: "cookies"`):

- Holds `{ token, refreshToken: "cookie-managed" }` — a sentinel, not a real
  token.
- `isLoading`/`isAuthenticated` hydrate from server-provided state (no flash).
- Refresh goes through the proxy endpoint, not the component directly.
- Sign-out POSTs to the proxy (server clears cookies AND revokes the session).
- `localStorage` mode stays the default for pure-CSR apps; the two modes share
  every hook surface so app code is identical.

## Differences from upstream that must be designed for

| Area              | Upstream                       | Ours                                                                            | Consequence                                                                                                                                                                                                                                                                                                       |
| ----------------- | ------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rotation          | Simple: old refresh → new pair | Session family + replay revocation                                              | A mishandled refresh race looks like **token reuse** and kills the family. The boundary refresh must dedupe/serialize concurrent refreshes for the same cookie pair (request-scoped memoization + short-lived idempotent window), and the client must treat a lost race as "re-read cookies," not "session dead." |
| Action surface    | `signIn`/`signOut`             | + 2FA challenge, passkey ceremonies, verification-code sign-in, account linking | Proxy allowlist is a designed surface, not a constant. Each entry needs a test that its session lands in cookies.                                                                                                                                                                                                 |
| Session model     | JWT-primary                    | DB-primary (`authSessions`), JWT is the token field                             | Verified checks must hit the component query — same as upstream — but revocation correctness is _ours_ to keep; the optimistic tier must be documented as revocation-blind within token lifetime.                                                                                                                 |
| 2FA pending token | N/A                            | Opaque pending token before session mint                                        | Pending tokens must survive the server roundtrip: they're short-lived, they must be proxyable, and they MUST NOT be cookie-persisted (transient state).                                                                                                                                                           |
| Passkey sign-in   | N/A                            | Ceremony completes client-side, returns a session                               | The ceremony result must POST through the proxy so the session lands in cookies — the client cannot set httpOnly cookies itself.                                                                                                                                                                                  |

## Adapter mapping

| Contract piece            | Next.js adapter                                    | TanStack Start adapter                                                |
| ------------------------- | -------------------------------------------------- | --------------------------------------------------------------------- |
| Cookie schema             | `cookies()` API / `NextResponse` cookie writes     | `getRequestHeader`/`setResponseHeader`                                |
| Optimistic resolution     | `proxy.ts` (renamed middleware)                    | Route `beforeLoad` — UX tier only                                     |
| Verified resolution       | DAL helper + React `cache()`                       | `createMiddleware` attaching `context.session`                        |
| Boundary refresh/exchange | `proxy.ts` refresh + code exchange                 | `createServerFn` called in `beforeLoad`, or global request middleware |
| Proxy endpoint            | Route handler `/api/auth`                          | Server route `/api/auth`                                              |
| Client provider mode      | `ConvexAuthNextjsServerProvider` → client provider | Provider reading root-route context                                   |
| Post-auth revalidation    | `router.refresh()` / cache tags                    | `router.invalidate()`                                                 |
| Cache discipline          | `cookies()` opts out of static caching             | `Cache-Control: private, no-store` headers on session routes          |

## Test plan — before any adapter ships

Component-level (convex-test, no framework):

- Session-minting action → token pair round-trips through an HTTP transport
  client, identical to websocket behavior.
- `rotateSession` called twice concurrently with the same refresh token →
  exactly one succeeds; the family survives; the loser can recover by
  re-reading state (define and assert the loser-visible result).
- Replay: refresh with an already-rotated token → family revoked (existing
  coverage) **plus** the concurrent-above case is not misclassified as replay.
- 2FA pending token: mint → proxy-style call → verify → session; pending token
  is single-use and expires.
- Revoked session resolves `isSessionActive=false` even when JWT is
  structurally valid and unexpired.

Adapter-level (upstream's bar is `test-nextjs/e2e-tests` — match it):

- E2E: sign-in → SSR page renders authed on first paint (no flash) → reload →
  still authed → sign-out → SSR renders unauthed.
- E2E: two parallel SSR requests with an expired token → one refresh, both
  succeed, family intact.
- E2E: OAuth code lands on GET navigation → exchange → redirect, code stripped.
- E2E: passkey sign-in → session cookie set → SSR authed.

## Open questions

1. **Refresh-race semantics** — the single highest-risk design point. Options:
   (a) boundary serializes and the loser re-reads the response cookies,
   (b) component-level grace window where the immediately-previous refresh
   token stays valid once (weakens replay detection), (c) advisory lock in the
   component. Lean: (a) — keeps replay detection strict; needs the adapter to
   distinguish "rotated" from "stolen" in the component's response.
2. **Sentinel vs absent refreshToken in cookie mode** — upstream uses
   `"dummy"`; a structured sentinel is more explicit but changes the client
   contract.
3. **Which session-minting actions join the allowlist** — enumerate from
   `signIn`'s internal dispatch (password/oauth/code/passkey/2FA) rather than
   letting the proxy grow organically.
4. **Whether verified resolution needs a dedicated component query** or the
   existing session lookup suffices — likely a thin `isSessionActive`
   public query on the component for a stable adapter API.

## Sequencing

1. This contract reviewed (Cursor + CodeRabbit) — design-doc PR, no code.
2. Component-level tests for refresh-race semantics (open question 1) — proves
   the contract is implementable before any framework exists.
3. Next.js adapter (#321) — delegated, using upstream's layout as the template
   and this contract for the deltas.
4. TanStack Start adapter — built after the Router example (#341) merges and
   the contract is proven on Next.js.
