# @vortex-api/convex-auth

## 3.1.0

### Minor Changes

- 96de151: feat: Clerk/WorkOS migration foundation — `verifyPassword` now accepts imported bcrypt digests (`$2a$`/`$2b$`/`$2y$` via hash-wasm, isolate-safe) and any verified non-native or below-floor credential lazily rehashes to argon2id with a CAS guard; new `@vortex-api/convex-auth/migrations` export ships the normalizers (Clerk API+CSV, WorkOS) plus idempotent internal `migrateOrganization`/`migrateMembership` writers with role seeding, invited→active promotion, and migration-marker attach guards
- f68d288: Component contract tightening:
  
  - **Passkey options require a non-empty `origin`** — `generatePasskeyRegistrationOptions` and `generatePasskeyAuthenticationOptions` now reject calls without `origin` (or with an empty string/array), so every new challenge records its expected origin. Challenges created before this change still verify via the caller-supplied fallback during their TTL. The runtime wrapper already requires `origin` in config; **direct component callers must now pass it**.
  - **Return validators filled in** — `generatePasskeyRegistrationOptions` (`v.any()` → record), `native/accounts` (`updateAccountTokens` → null, `createAccount` → id, `getAccountBySubject` → doc|null), `native/codes` (all four functions).
  - **`rateLimits` honesty** — `recordAttempt`/`checkRateLimit` no longer emit `count` (the backing rate-limiter doesn't expose bucket counts; it was always `0`). `count` is now optional in the return type. `cleanupExpiredRateLimits` documented as a kept no-op for contract compatibility.
- ce51bce: Add the Hono server adapter — `@vortex-api/convex-auth/hono`.
  
  `convexAuthMiddleware` is the whole server surface in one `app.use("*")`: it proxies `POST /api/auth` auth intents, lands OAuth/magic-link session triples as HttpOnly cookies, rotates near-expiry tokens onto downstream responses (rebuilding immutable responses when needed), and strips auth cookies from cross-origin requests. `convexAuthProxyHandler` mounts the proxy as an explicit route instead. Session helpers (`getConvexAuthSession`, `getConvexAuthToken`, `convexAuthCookieState`, `getAuthServerState`) take the Hono context and are rotation- and revocation-aware. Works on `@hono/node-server`, Bun, Deno, and any fetch-runtime Hono supports. `hono` is an optional peer (`>=4`); the adapter is type-only against it.
  
  The request-scoped session bookkeeping (rotation overrides, CORS-strip tracking, `verifySession` memoization) moved from the TanStack adapter into the shared `ssr/` substrate — it was already framework-agnostic; `./tanstack-start/server` re-exports it unchanged.
- f626e8f: Declare `engines.node >=22` and drop Node 20 from the tested matrix.
  
  Node 20 reached end-of-life in April 2026 and no longer receives security fixes. The library's Node-touching surface (server-side helpers used inside Next.js handlers, TanStack server functions, and SSR glue) is now tested on Node 22 and Node 24 only. Consumers on Node 20 will see an install-time `engines` warning rather than a silent unsupported environment; the deployed component code is unaffected — it runs in the Convex V8 isolate, which is not Node at all.

### Patch Changes

- cf4ef80: Component review hardening — three correctness fixes:
  
  - **OAuth `requireEmailVerification` ordering**: the check now runs before `provisionFromIdentity` and account-token writes, so a denied sign-in no longer leaves orphaned user/identity rows or overwrites stored OAuth tokens on a rejected request.
  - **`provisionFromIdentity` linking invariant**: implicit email-match linking now requires `identity.emailVerified === true` — callers can no longer link an unverified provider email into an existing account via the default `allowLink: true`. The `trustedProviders` escape is preserved through a new explicit `allowUnverifiedEmailLink` arg. Provisions can no longer downgrade a verified user's `emailVerified` flag (monotonic).
  - **Admin `listUsers` search**: partial substring search now works — the previous path exact-matched `by_email`/`by_name` then substring-filtered the already-exact set, so partial terms silently returned nothing. Search now paginates with `filterWith` (matching the admin audit pattern) and supports cursors.
- d0ea688: chore: move `set-cookie-parser` to devDependencies — it is only used by the internal conformance harness, so it no longer lands in consumer installs
- fa5582f: perf: index sweep — passkey revocation now reads `authSessions` through `by_credential_id` instead of scanning every session for the user, and 17 never-referenced index declarations (16 unique names) are removed across `users`, `auth_identities`, `auth_admin_audits`, `webhook_deliveries`, `auth_passkeys`, `organization_members`, `agent_auth_audit_events`, `auth_md_*`, and `mcp_oauth_signing_keys` (one-line re-add if a query path lands for them)
- d0ea688: Bump internal dependencies: `@convex-dev/rate-limiter` 0.3 → 0.4 (additive release — `RateLimiter` constructor, `limit`, and `check` APIs unchanged; verified against the full rate-limit suite) and `convex-helpers` 0.1.80 → 0.1.124. Also bumps `@simplewebauthn/server`, `jose`, `oauth4webapi`, and `otpauth` to latest patches.

## 3.0.1

### Patch Changes

- 502bf29: fix(nextjs): translate `:name(.*)` legacy wildcards to `{*name}` — `createRouteMatcher` no longer throws on patterns like `/:locale(.*)` under path-to-regexp v8
