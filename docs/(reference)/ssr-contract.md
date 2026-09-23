# SSR auth contract

Design contract for server-side-rendering integrations (Next.js, TanStack
Start, and any future framework adapter). This document is the spec an adapter
must satisfy — it is framework-neutral on purpose, so each adapter stays a thin
shell over shared semantics.

Status: implemented. The Next.js adapter
(`packages/auth/src/nextjs/`, exported as `@vortex-api/convex-auth/nextjs`
and `@vortex-api/convex-auth/nextjs/server`) satisfies this contract.
Divergences from this draft are called out inline where the shipped design
differs.

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

**Tension we must own:** upstream puts a Convex mutation (token refresh, code
exchange) inside the proxy/middleware boundary — a documented exception to
Next's "no DB in proxy" rule. We do the same, and the doc must say so plainly:
the proxy performs at most one refresh per request, must not run on prefetch
where avoidable, and must coalesce concurrent refreshes for the same session
(§4).

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

Any adapter named `convex-auth/<framework>` must implement these seven pieces.

### 1. Cookie schema

Our HTTP auth layer already sets cookies — `convex-auth-token`,
`convex-auth-refresh-token`, `convex-auth-session-id`,
`convex-auth-two-factor`, `convex-auth-trusted-device`
(`convex-runtime/native/http.ts`) — but those live on the **Convex origin**
(`.convex.site`) for the component's own HTTP endpoints. SSR cookies are a
**separate, app-origin set** the adapter owns. Naming should stay parallel so
the two origins are unambiguous:

Shipped names (`server/cookies.ts`):

| Cookie                                | Contents                                     | Lifetime                |
| ------------------------------------- | -------------------------------------------- | ----------------------- |
| `__Host-__convexAuthToken`            | Session JWT (access token)                   | JWT lifetime            |
| `__Host-__convexAuthRefreshToken`     | Opaque refresh token                         | Refresh TTL             |
| `__Host-__convexAuthTwoFactorPending` | Opaque 2FA pending token, only mid-challenge | Challenge TTL (minutes) |
| `__Host-__convexAuthTrustedDevice`    | Trusted-device token after 2FA               | Trusted-device TTL      |

All `HttpOnly; Secure; SameSite=Lax; Path=/`. The `__Host-` prefix applies
off localhost only — on `localhost`, loopback IPs, and `*.localhost` the
unprefixed names are used because `Secure` cookies cannot be set over local
HTTP.

No OAuth-attempt cookie exists: our OAuth state/PKCE verification happens
entirely on the Convex origin's HTTP routes; the app only ever receives the
finished session triple (§4).

Two corrections from the first draft, both verified against the code:

- **The access token is the cookie; the refresh token is the secret.** The
  client provider holds the short-lived JWT in memory for its Convex websocket
  auth and client-direct calls — that is normal and matches upstream (they
  pass `token` into client state; only `refreshToken` is stubbed). What MUST
  NOT reach JavaScript is the refresh token.
- **The 2FA pending token belongs in a cookie** for SSR — a reload-safe
  challenge form needs it, and our HTTP layer already cookies it on the Convex
  origin. It is short-lived and single-use; it is not "transient JS state."
- **Org context needs no cookie** — `activeOrganizationId` lives on the user
  row; SSR resolves it through `verifySession`.

### 2. Optimistic session resolution

A request-boundary helper that reads the token cookie and returns a cheap
verdict — JWT `exp` decode only, **no Convex call**. Feeds redirect
pre-filtering (Next `proxy.ts`, Start `beforeLoad`). Must document that this
verdict is not authorization — revocation-blind within token lifetime.

Shipped: `convexAuthNextjsCookieState(request)` → `{ hasSessionCookie,
tokenExpired }` (`server/index.tsx`). Middleware runs CORS stripping, the
session-triple intercept, and proactive refresh before the verdict is read.

### 3. Verified session resolution

A server helper calling the component's **existing `verifySession` query**
(`convex-runtime/native/queries.ts`) over HTTP transport — it already performs
the revocation-aware session lookup and returns user + session id. No new
component query is needed for the adapter API; `verifySession` is the stable
surface.

- JWT-valid-but-revoked (`authSessions.revokedAt` set) MUST resolve to
  unauthenticated — `verifySession` already does this.
- Adapter memoizes per request (React `cache()` on Next; request-scoped
  middleware context on Start).

Shipped: `convexAuthNextjsSession()` is the `cache()`-memoized verified
lookup for RSC render passes; `isAuthenticatedNextjs()` derives from it.
The middleware ctx's `isAuthenticated()` does NOT use `cache()` — React's
render cache is invalid outside render context — it memoizes on a
per-request promise instead, so repeat calls in one handler pay one query
while the next request re-verifies. `cookieState()` remains the cheap
pre-filter. `convexAuthNextjsToken()` returns the raw JWT for
`fetchQuery`/`fetchAction` auth (§7).

### 4. Boundary refresh + code exchange

At the request boundary (before rendering):

1. If the token cookie is **near expiry** (proactive window, e.g. <60s of life)
   and a refresh cookie is present → call the refresh action → write the new
   `{token, refreshToken}` pair to response cookies.
   - **Refresh must be proactive, not reactive.** Session rotation refuses
     already-expired sessions, and the JWT `exp` is coupled to the session
     row's `expiresAt` — a "refresh after expiry" path mostly cannot succeed.
     If SSR refresh-on-expiry is ever required, the component must decouple
     JWT TTL from session TTL first.
   - **Resolved:** `updateSession` (`provider.ts`) takes only
     `{ refreshToken }` and resolves the caller through the token itself —
     provider-agnostic, no `ctx.auth` dependency. No component change needed.
2. **Session-triple landing replaces both exchangers** (divergence from the
   draft): upstream exchanges a `code`/`token` param at the app boundary
   because its OAuth callback lands there unfinished. Our Convex-origin HTTP
   routes complete OAuth and magic-link verification server-side and redirect
   to the app carrying `?token=&refreshToken=&sessionId=` — an already-minted
   session. The adapter's request handler intercepts that triple on GET HTML
   navigations, writes the HttpOnly cookies, and 302-redirects with the
   params stripped (`server/request.ts`). The `refreshToken` param's presence
   discriminates a session triple from a lone password-reset `?token=`.

   **Browser binding (`landingVerifier`):** an already-minted session in a
   URL is bearer credentials in the query string — anyone holding the link
   can land it. To close the cross-browser login-CSRF gap (an attacker
   completing their own OAuth/magic-link flow and feeding the victim the
   landing URL), the flow binds the minted session to the browser that
   started it via a non-HttpOnly cookie —
   `__convexAuthLandingVerifier` (`__Host-` prefixed off localhost). The
   boundary mints it on same-origin HTML navigations that lack one; the
   client reads it and attaches it to OAuth sign-in (where it rides the
   signed state through the provider redirect) and magic-link requests
   (where it is stored on the verifier record). The callback/verify routes
   echo it onto the landing URL as `?landingVerifier=`, and the boundary
   writes auth cookies only when the param equals the cookie. Rejected
   landings are stripped and surfaced, not silent: the redirect carries
   `?error=landing_verifier_mismatch` (verifier absent/mismatched) or
   `?error=cross_origin` (credentialed cross-origin request) so the app
   can render a real error instead of appearing signed-out — and on
   same-origin rejections a fresh verifier cookie is minted so the next
   attempt self-heals. `requireLandingVerifier: false` (middleware/boundary
   option) restores the old behavior for deployments that predate verifier
   threading or rely on cross-browser magic-link opens.

   **Token mode binds too — in browsers.** `ConvexAuthProvider` attaches the
   verifier to OAuth/magic-link initiation in any DOM environment (not just
   cookie mode), and its URL-ingestion path applies the same param-vs-cookie
   check before accepting a session triple — same login-CSRF hole, closed
   client-side. `requireLandingVerifier={false}` on the provider is the
   escape hatch (off-browser initiation, cross-device magic links). Native /
   non-DOM runtimes get no verifier and no check — `document.cookie` does not
   exist to bind against, and those flows land via deep links, not URL params
   a web attacker could plant.

   **Cross-origin requests can never land a triple.** Even with
   `requireLandingVerifier: false`, the boundary only lands a session on a
   same-origin navigation — a credentialed cross-origin `fetch` carrying the
   triple gets the params stripped and **no** `Set-Cookie`, since a
   CORS-failed response still reaches the browser's cookie store.

#### Refresh races — the design load-bearing decision

Our component treats a presented-but-rotated refresh token as **replay and
revokes the whole session family** (`native/sessions.ts` — fail closed,
commented as deliberate). Convex OCC makes the concurrent case deterministic:
two requests holding the same old refresh cookie both read `revokedAt ===
undefined`; the winner commits rotation; the loser retries, sees `revokedAt`,
and kills the family — including the pair the winner just minted.

**"Serialize at the adapter + loser re-reads cookies" cannot work.** The
losing request arrived with the old cookie baked into its request headers —
there is no shared jar to re-read, and HttpOnly means client JS can't re-read
either. Adapter-side request dedup helps within one request but cannot
synchronize two independent requests.

**The fix belongs in `rotateSession`**: a bounded grace on the
immediately-preceding family token. When a presented refresh token was rotated
within a short window and is the family's direct predecessor, the component
mints a **sibling pair** in the same family instead of revoking — bounded
convergence, not a second rotation of the same row. Tokens older than the
window, or not rotated through, still revoke the family.

**As built (PR #343):** `rotateSession` marks `rotatedAt` on rotation and
returns `"converge"` for a just-rotated predecessor inside a **15s** window;
`convergeSession` re-validates inside the mutation and mints the sibling.
Bounds, in force: `graceRedemptions` ≤ **8** per predecessor row, live family
sessions ≤ **10** (a `by_family` scan bounded at 2,000 rows), and convergence
requires **at least one live family member** — sign-out, password reset, or
reuse revocation during the window kills the grace with the family, so a
stolen predecessor cannot resurrect it. Refusals are fail-soft (`null`, no
revocation) for over-cap and live-cap, fail-closed (family revoke) for
out-of-window and never-rotated replays; refused redemptions write
`refresh_token_grace_exhausted` audit events. Tradeoff, stated plainly: a
stolen token replayed inside the window mints a bounded number of sessions
rather than triggering revocation — the same leeway Auth0-style rotation
accepts, capped and audited.

### 5. Auth-action proxy

An endpoint the client POSTs to for session-mutating actions. On the server it:

- Rejects non-POST and applies **`validateCsrfHeaders`**
  (`convex-runtime/native/csrf.ts`) — our existing CSRF primitive, stronger
  than a bare cross-origin check. Fetch Metadata is a gate, not a grant:
  `cross-site` **and** `same-site` requests must also carry an `Origin` (or
  `Referer`) matching the request host or a trusted origin — a sibling
  subdomain is `same-site` to the browser but cross-origin to us, and
  `SameSite=Lax` cookies flow to it. `same-origin`/`none` requests still get
  their `Origin` validated when present, so contradictory headers fail
  closed rather than passing on the metadata's word.
- Enforces an **action allowlist**.
- Substitutes server-confidential fields from cookies — `refreshToken`, and
  the 2FA pending token where the action consumes it — the client never sends
  the real values.
- Forwards to the component action over HTTP transport; writes result cookies
  on the response.
- **Sign-out is a required entry**: clears all auth cookies AND revokes the
  session server-side (the component's `signOut` revokes by JWT `sessionId`).
  The client-only helper is insufficient in cookie mode — it cannot clear
  HttpOnly cookies.

Upstream allowlists `signIn`/`signOut`. Ours is a designed surface because our
mint sites are wider — shipped intents (`server/proxy.ts`):

| Intent                                              | Why it must proxy                                                |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| `signIn` / `signUp`                                 | Mints a session — or returns a 2FA pending challenge             |
| `twoFactorVerifyTOTP` / `twoFactorVerifyBackupCode` | Mints a session; pending token substituted from its cookie       |
| `verifyPasskeyAuthentication`                       | Mints a session; ceremony options fetch stays client-direct      |
| `verifyEmailOtp`, OAuth `callback`                  | Mint sessions                                                    |
| `signInAnonymous` / `linkAnonymousAccount`          | Mint / replace the session                                       |
| `updateSession`                                     | Refresh token substituted from its cookie                        |
| `signOut`                                           | Clears cookies + revokes; succeeds silently with no token cookie |

Every entry maps to a configured action reference (`options.actions`), so the
consumer's file layout — not hardcoded `"auth:signIn"` strings — names the
targets. Confidential result fields (`refreshToken`, 2FA pending, trusted
device) are stripped from the JSON body; they only ever travel as Set-Cookie.

Session-read and non-minting mutations (profile, org, api-key operations) stay
client-direct with the in-memory access token.

### 6. Cookie-mode client provider

`ConvexAuthProvider` gains a **mode flag** — shipped as
`storageMode: "cookies"` — NOT a sentinel refresh token. A truthy sentinel
(`"dummy"`, `"cookie-managed"`) is a landmine: the auto-refresh timer and
`if (refreshToken)` sites would treat it as a real token and sign the user out
when it fails.

In cookie mode the provider:

- Holds the access token **in memory only** (`useState`, never written to
  `localStorage`/`sessionStorage`); `refreshToken` state is always `null`.
- Initializes `token` state from the server-provided prop at construction —
  `useState(initialToken)`, not a post-mount effect — plus an `initialUser`
  so `isAuthenticated`/`isLoading` are correct on first paint. Current
  post-hydrate token loading produces a signed-out flash, then a loading
  flash; that is the no-flash bug to design against.
- **Disables the client refresh timer** and the mount-time refresh — all
  rotation goes through the boundary/proxy.
- **Disables URL token ingestion** — the `?token=&refreshToken=&sessionId=`
  search-param branch must not run in cookie mode (OAuth/magic-link HTTP
  redirects place the refresh token in the query string today; that path is
  replaced by cookie writes).
- Sign-out POSTs to the proxy (clears cookies + revokes + clears
  `twoFactorChallengeToken` state).
- **Every session-minting write path routes through the proxy**, not just
  `useAuthActions`: `usePasskeys` calls `verifyPasskeyAuthentication` and
  writes tokens directly today; OAuth callback, OTP verify, and 2FA verify do
  the same. Cookie mode is a write-path change at every mint site, with the
  hook surface kept identical so app code doesn't change.

`localStorage` mode stays the default for pure-CSR apps.

### 7. SSR Convex transport binding

How the adapter authenticates Convex calls on each side:

- **Server**: binds the token cookie to `fetchQuery`/`fetchMutation`/
  `fetchAction` (Next) or `ConvexHttpClient` (Start) per request — the token
  authenticates the HTTP call the same way it authenticates the websocket.
- **Client**: `client.setAuth` with the in-memory token, as today.
- **Cache discipline**: session-bearing responses are
  `Cache-Control: private, no-store`; on Next, `cookies()` already opts the
  route out of static caching — the adapter must not reintroduce shared
  caching for session data.

## Differences from upstream that must be designed for

| Area              | Upstream                       | Ours                                                                             | Consequence                                                                                                                                                                           |
| ----------------- | ------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rotation          | Simple: old refresh → new pair | Session family + replay revocation                                               | **Resolved:** bounded-grace converge landed (§4 "As built") — parallel boundary refreshes mint siblings instead of revoking. Proven against real OCC contention on a live deployment. |
| Action surface    | `signIn`/`signOut`             | + 2FA challenge, passkey ceremonies, verification-code sign-in, account linking  | Proxy allowlist is a designed surface (§5). Each entry needs a test that its session lands in cookies.                                                                                |
| Session model     | JWT-primary                    | DB-primary (`authSessions`), JWT is the token field                              | `verifySession` already does the revocation-aware lookup — reuse it. The optimistic tier stays documented as revocation-blind within token lifetime.                                  |
| Refresh binding   | Generic                        | `updateSession` takes `{ refreshToken }` only                                    | **Resolved:** refresh resolves the caller through the token — provider-agnostic as shipped.                                                                                           |
| TTL coupling      | —                              | JWT `exp` couples to `authSessions.expiresAt`; rotation refuses expired sessions | Boundary refresh is proactive-only (§4). Decoupling JWT/session TTL is a separate component decision if refresh-on-expiry is ever in scope.                                           |
| 2FA pending token | N/A                            | Opaque pending token; already a cookie on the Convex origin                      | App-origin pending cookie (§1); proxy substitutes it server-side; single-use + challenge TTL enforced by the component.                                                               |
| Passkey sign-in   | N/A                            | Ceremony completes client-side, `usePasskeys` writes the session itself          | The mint write path must route through the proxy so the session lands in cookies (§6) — the client cannot set HttpOnly cookies.                                                       |
| URL ingestion     | N/A                            | Provider reads `?token=&refreshToken=&sessionId=` into state on mount            | Disabled in cookie mode (§6) — OAuth/magic-link redirects place refresh tokens in the query today.                                                                                    |

## Adapter mapping

| Contract piece            | Next.js adapter                                   | TanStack Start adapter                                                |
| ------------------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| Cookie schema             | `cookies()` API / `NextResponse` cookie writes    | `getRequestHeader`/`setResponseHeader`                                |
| Optimistic resolution     | `proxy.ts` (renamed middleware)                   | Route `beforeLoad` — UX tier only                                     |
| Verified resolution       | DAL helper + React `cache()` over `verifySession` | `createMiddleware` attaching `context.session` via `verifySession`    |
| Boundary refresh/exchange | `proxy.ts` proactive refresh + code exchange      | `createServerFn` called in `beforeLoad`, or global request middleware |
| Proxy endpoint            | Route handler `/api/auth`                         | Server route `/api/auth`                                              |
| Client provider mode      | Server provider → client provider, `storageMode`  | Provider reading root-route context, `storageMode`                    |
| Transport binding         | `convex/nextjs` fetch\* per request               | `ConvexHttpClient` per request                                        |
| Post-auth revalidation    | `router.refresh()` / cache tags                   | `router.invalidate()`                                                 |
| Cache discipline          | `cookies()` opts out of static caching            | `Cache-Control: private, no-store` headers on session routes          |

TanStack Start caveat: the rotation-override `WeakMap` and CORS-strip
`WeakSet` are keyed on the middleware's `Request` object identity — the
helpers assume `getRequest()` (and anything the session helpers see)
resolves to the same object for the request's lifetime. If TanStack ever
clones the request upstream, rotation overrides fail closed (a revoked
cookie reads as signed-out) and the CORS strip falls back to the
physical cookie-header rewrite, which the middleware attempts for exactly
this reason.

## Test plan — before any adapter ships

Component-level (convex-test, no framework) — **blocking**; the rotation
items landed in PR #343:

- ~~Concurrent rotation: two `rotateSession`-equivalent calls with the same
  refresh token → the loser converges; the family survives; neither request
  gets `null`-as-theft.~~ ✅
- ~~Grace boundary: predecessor inside the window → converge; outside →
  family revocation.~~ ✅
- ~~Dead-family convergence refused (logout/reset during the window)~~ ✅ and
  ~~live-session cap refusal~~ ✅, both with `grace_exhausted` audit coverage.
- ~~`verifySession` over HTTP transport: revoked session resolves
  unauthenticated even when the JWT is structurally valid and unexpired~~ ✅ —
  `convex-runtime/native/http.test.ts` drives the real route handlers with
  real `Request` objects: `/api/auth/convex/token` and `/api/auth/session`
  reject/null a revoked session with a valid JWT, and round-trip a live
  session into a freshly verified Convex token.
- ~~Provider-agnostic refresh: a session minted via a non-password identity
  (OAuth/passkey) rotates successfully through the refresh path~~ ✅ —
  `authSessions` stores `identityId` at every mint site and rotates it
  forward; pre-column rows resolve via the session-JWT claim as a
  transitional path; `getIdentityById` resolves the doc; sessions with
  neither source fail closed — no provider/issuer guessing.
- ~~Session-minting action → token pair round-trips through an HTTP transport
  client, identical to websocket behavior~~ ✅ — `http.test.ts` asserts
  `/api/auth/sign-in` writes access + refresh cookies and a verifiable token
  body from a real request.
- ~~2FA pending token: mint → proxy-style substitution → verify → session;
  pending token is single-use and expires~~ ✅ — `native-codes.test.ts`
  proves the `two_factor_pending` lifecycle (identity carried through
  lookup, single-use consume, expiry refusal); `http.test.ts` proves the
  pending token lands on the `convex-auth-two-factor` cookie the proxy
  substitutes server-side.

Adapter-level (upstream's bar is `test-nextjs/e2e-tests` — match it):

- E2E: sign-in → SSR page renders authed on first paint (no flash) → reload →
  still authed → sign-out → SSR renders unauthed.
- E2E: two parallel SSR requests with a near-expiry token → one effective
  rotation, both succeed, family intact.
- E2E: OAuth code lands on GET navigation → exchange → redirect, param
  stripped; magic-link `token` does the same on its own route.
- E2E: passkey sign-in → session cookie set → SSR authed; 2FA challenge
  survives a reload via the pending cookie.
- E2E: prefetch flood does not refresh-storm (coalescing assertion).

## Resolved by review

- **Sentinel vs absent refreshToken** — resolved: mode flag, `refreshToken`
  stays `null` in the browser. A truthy sentinel misfires `if (refreshToken)`
  sites and the auto-refresh timer.
- **Dedicated `isSessionActive` query** — resolved: unnecessary; the existing
  `verifySession` query is the adapter surface.
- **2FA pending persistence** — resolved: short-lived HttpOnly cookie
  (reload-safe challenge), not transient JS state.
- **Org cookie** — resolved: not needed; `activeOrganizationId` is on the user
  row.

## Open questions

1. ~~**Grace-window parameters**~~ — resolved in PR #343: 15s window,
   idempotent within the window, 8 redemptions per predecessor, 10 live
   sessions per family, family-liveness required. Constants in
   `component/native/sessions.ts`; configurability deferred until a real
   consumer needs it.
2. **Allowlist enumeration** — the final list of session-minting actions from
   `signIn`'s internal dispatch + the mint sites in §5.
3. **Proactive-refresh threshold** — how near expiry triggers a boundary
   refresh; interacts with Convex prefetch and request fan-out.
4. **JWT/session TTL decoupling** — only if refresh-on-expiry is ever in
   scope; out of scope for the first adapters.
5. **`authSessions.identityId` optional → required** — optional now because
   existing deployments hold pre-column rows; rotation propagates the column
   forward, so ~one refresh-TTL (30d) after release every live session
   carries it. Follow-up: backfill live rows or flip the validator to
   required in a breaking release, then delete the JWT-claim transitional
   path.

## Sequencing

1. This contract reviewed (Cursor — done; CodeRabbit on PR #342).
2. ~~**Blocking component work**~~ — landed in PR #343: `rotateSession`
   convergence + `convergeSession` + provider-agnostic refresh via the
   `authSessions.identityId` column (JWT claim is the transitional path for
   pre-column rows), with the component-level tests above. All
   component-level contract items are now covered.

   **Real-deployment validation (fast-gopher-450, 2026-09-18):** the
   parallel-refresh race was exercised over HTTP on a live Convex
   deployment — eight simultaneous `update-session` calls on one refresh
   token produced one rotation and seven converged siblings, all bound to
   the correct identity. The grace cap refused the ninth in-window
   presentation without revoking the family, and an out-of-window replay
   revoked the family end-to-end (subsequent session verification returned
   null). It also caught a bug no in-repo test could:
   `getRefreshTokenByTokenHash`'s returns validator predated the rotation
   fields, so `familyId`/`rotatedAt`/`graceRedemptions` rows threw
   `ReturnsValidationError` at the function boundary — action-level tests
   dispatch `runQuery` to raw handlers and never see returns validation.
   Fixed in `bd99c20`. The live-session cap was exercised the same way:
   a second race on a rotated sibling drove the family to exactly ten
   live sessions, after which further converges were refused without
   harming the family. All grace bounds (8 redemptions, 10 live, 15s
   window) are now proven on real OCC; the adapter E2E items below remain
   the only open proof tier.

3. Next.js adapter (#321) — landed; live-verified on the `examples/nextjs`
   demo (proxy intents, rotation, family revocation, CSRF matrix).
4. TanStack Start adapter (#353) — landed. The shared fetch-shaped core
   (`src/ssr/`) carries the proxy pipeline, cookie schema, boundary
   refresh, and CORS strip; the adapter layer is only the middleware/
   provider binding. Live-verified on `examples/tanstack-start`: sign-in
   mint, SSR seed via `beforeLoad` + `getAuthServerState`, `context.session`
   in protected server functions, rotation, sign-out revocation, and the
   CSRF/CORS/405 rejection matrix.
