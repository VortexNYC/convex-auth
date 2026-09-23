---
"@vortex-api/convex-auth": patch
---

fix(auth): harden SSR/auth surface — redirect allowlists, CSRF, CORS landings, response forwarding

A ruthless review sweep of the Next.js / TanStack Start SSR surface found
and fixed seven issues:

- **OAuth `signIn` action accepted arbitrary `callbackURL`/`errorURL`/
  `newUserURL`** — the HTTP routes validated them, the public action did
  not, so anyone could mint an OAuth URL whose callback exfiltrates
  `?token=&refreshToken=` to an attacker origin. `handleSignIn` now
  validates all three against a merged allowlist (`SITE_URL`,
  `CONVEX_SITE_URL`, `emailAndPassword.trustedOrigins`,
  `oauth.trustedOrigins`, OIDC login origin) on every entry point.
- **Protocol-relative callback URLs bypassed the allowlist** —
  `//evil.com` failed the old `startsWith("http")` shape check but
  resolves cross-origin. The validator now resolves first, requires
  `http:`/`https:`, and compares normalized origins.
- **Cross-origin requests could land session triples** in compat mode
  (`requireLandingVerifier: false`) — a credentialed cross-origin fetch
  carrying the triple got auth `Set-Cookie` written back (a CORS-failed
  response still reaches the cookie store). Both boundaries now require a
  same-origin request context for landings, refresh, and verifier mints.
- **`Sec-Fetch-Site: same-site` skipped origin validation** — a sibling
  subdomain is same-site to the browser but cross-origin to the app, and
  `SameSite=Lax` cookies flow to it. `same-site` now requires an allowed
  `Origin`/`Referer`; `same-origin`/`none` requests still validate a
  present `Origin`, so contradictory headers fail closed.
- **Relative redirect URLs resolved against `http://localhost`** instead
  of the app origin — now `SITE_URL` → `CONVEX_SITE_URL` → localhost.
- **Magic-link `errorCallbackURL`/`newUserCallbackURL` were unvalidated**
  (open redirect / ignored). Both validate before use, and
  `newUserCallbackURL` is now honored when the link creates a user.
- **Next.js middleware dropped the body of plain `Response` custom
  handlers** — `NextResponse.next(response)` treats the argument as init
  and emits a bodyless continuation. Plain responses are now rebuilt with
  body, status, and headers preserved.
- **Custom-scheme trusted origins (React Native / Expo deep links)**
  regressed under the strict `http(s)`-only check — `myapp://`/`exp://`
  URLs have no WHATWG origin. They are now allowed by explicit
  non-http(s) `trustedOrigins` patterns (`myapp://`, `exp://**`,
  `exp://192.168.*.*:*/**`), which also close the `origin === "null"`
  aliasing where any opaque-scheme URL could match an opaque pattern.
- **Empty `landingVerifier` values could alias-match** — `?landingVerifier=`
  parses to `""`, which equaled an empty-valued cookie. Both readers now
  normalize empty to absent, and the proxy substitutes the cookie value
  (never the body) for `signIn` too, matching `callback`.
- **Session-bearing responses lacked `Cache-Control`** — proxy JSON and
  landing redirects now emit `private, no-store` (302s are heuristically
  cacheable).

All fixes are covered by regression tests; see `ssr-contract.md` for the
updated threat model.
