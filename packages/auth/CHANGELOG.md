# @vortex-api/convex-auth

## 3.2.0

### Minor Changes

- c1acd65: Add global-scope webhook endpoint lifecycle operations. `createWebhookEndpoint` accepts org-less (platform-wide) endpoints, but the existing `setWebhookEndpointStatus` / `deleteWebhookEndpoint` require an `organizationId` and fail closed on org-less rows — so global endpoints could be created but never disabled, archived, or deleted.
  
  New component functions mirror the org-scoped set: `listGlobalWebhookEndpoints`, `setGlobalWebhookEndpointStatus`, and `deleteGlobalWebhookEndpoint`. They resolve through a dedicated `requireGlobalWebhookEndpoint` guard that rejects org-scoped endpoints, matching the org ops which already reject org-less ones — each scope fails closed on the other.
- 1bd3bc6: feat(auth): Google One Tap sign-in (#206)
  
  Adds `convexAuth({ oneTap })` — verifies a Google Identity Services ID token
  against Google's JWKS via the existing `createGoogleProvider` path (RS256,
  iss/aud/exp, optional `hd`), then provisions the same `google` identity as
  redirect OAuth so both flows resolve to one account.
  
  - Server action `signInOneTap` with `disableSignUp`,
    `disableImplicitSignUp`, `requireEmailVerification`, nonce claim pinning,
    and per-subject rate limiting (on by default)
  - `oneTap: true` inherits `clientId`/`hd`/`maxTokenAge`/`fetchImpl` from
    `oauth.google`; `clientSecret` is never required
  - `useAuthActions().signInOneTap({ idToken })` on React and React Native,
    `signIn.oneTap({ idToken })` on the Better Auth client
  - SSR cookie-mode support via the `signInOneTap` proxy intent and Next.js
    serialization
- 1ad578f: Add phone-number sign-in via SMS OTP (`convexAuth({ phone })` → `sendPhoneOtp`/`verifyPhoneOtp`, `signIn.phoneOtp`). Numbers normalize to E.164, land on `users.phoneNumber`/`phoneNumberVerified` with a `by_phoneNumber` index, and provision a `phoneOtp` identity that fails closed on collisions. Session-gated `phone-verification` codes verify an existing account's number and link the `phoneOtp` identity. Reuses `createTwilioSmsOtpSender`; optional per-phone rate limiting on sends and verifies. Migration CLI now writes `username`/`displayUsername`/`phoneNumber`/`phoneNumberVerified` onto migrated users instead of dropping them.
- 7110b45: Add username/password authentication. `convexAuth({ username })` enables `signUpUsername` / `signInUsername` actions, `POST /api/auth/sign-up/username` and `/api/auth/sign-in/username` HTTP routes, `signUpUsername`/`signInUsername` SSR proxy intents, `useAuthActions().signUpUsername`/`signInUsername`, and `client.signUp.username`/`client.signIn.username` on the Better Auth-shaped client.
  
  Users gain optional `username` (normalized, unique via `by_username`) and `displayUsername` (original casing) fields. `provisionFromIdentity` now rejects username collisions inside the serialized mutation with `duplicateField: "username" | "email"`, and exposes `getUserAndAccountByUsername`. Username identities use `provider: "username"`, `issuer: "native"` and are never linkable by email claim.
  
  Sign-in shares the email/password pipeline: migrated bcrypt credentials rehash to argon2id on first verify (CAS-guarded), per-username rate limiting, and the same 2FA / trusted-device challenge flow. Optional `usernameValidator`, length bounds, `checkBreach`, `requireVerifiedEmail` (for attached emails), `captcha`, and `onExistingUserSignUp` are supported.

### Patch Changes

- 5ffc617: fix(component): use `by_admin` index in `listAdminAudits` when `adminId` filter is set — previously scanned the whole audit table on every filtered page
- 6be730d: Fix proxied password/username sign-in rejecting the cookie-substituted `landingVerifier` with `ArgumentValidationError`. The SSR proxy substitutes the landing verifier from its cookie into `signIn`, `signInUsername`, and `callback` args; the two password actions never declared the field, so every cookie-mode sign-in 400'd once a verifier cookie existed (the middleware mints one on any navigation). Both actions now accept and echo it into the session result, matching the `nativeAuthSessionValidator` contract used by the component's redirect-stamping routes. Also fixes `getConvexNextjsOptions` emitting `{ url: undefined }` when callers pass `convexUrl` as a present-but-unset key — `convex/nextjs` warns "deploymentUrl is undefined" on every call with an explicit `undefined` and will treat it as an error in a future release; omitting the key preserves the `NEXT_PUBLIC_CONVEX_URL` env fallback cleanly.
- 8e8f8e2: Redirect with `unsupported_provider` instead of an unhandled 500 when the OAuth signin or callback route is hit with an unconfigured provider id.
- 0b29e27: `convex-auth preflight` now validates `convex/auth.config.ts` — presence plus the canonical `createConvexAuthProvider` wiring — via a new `providerConfigPath` backend-setup option wired in the CLI's `backendSetupFromConvexDir`. The existing "Convex auth config" slot validates `auth.ts` (the `convexAuth()` callsite) and its default path is corrected to `convex/auth.ts` to match; previously it pointed at `convex/auth.config.ts` while requiring a `convexAuth` snippet that file never contains, so programmatic callers with defaults could false-fail it.
  
  Nothing validated `auth.config.ts` before this change, which let a real consumer-facing bug ship: without the provider registration, Convex rejects any request carrying a session JWT as caller auth with `NoAuthProvider` **before the function runs** — proxied `signOut` cleared cookies and returned 400 while the server-side session stayed valid, so a stolen cookie pair remained live after "logout". `convex-auth check`/bug-report already diagnosed the file; preflight now fails on its absence too.
  
  Heads-up for consumers running `convex-auth preflight` or `auth:preflight`: a previously green run will now fail if `convex/auth.config.ts` is missing or lacks `createConvexAuthProvider` — that failure is the check working (the file is required wiring); `--skip-backend-setup` remains the escape hatch.
- 0b68330: fix(runtime): map expected 2FA errors to 401/400 on HTTP routes — `Invalid two factor code`, `Invalid two factor token`, `Not enrolled`, and `Unauthorized` previously surfaced as `500 unknown` on `/api/auth/two-factor/*`
- 4cb8d26: Make pending two-factor challenges retryable: a wrong TOTP or backup code
  no longer consumes the challenge — it records a failed attempt and the user
  can retry. Verification attempts are reserved atomically before the code is
  checked, so after 5 attempts the challenge stops accepting guesses even
  under concurrent requests. `authVerificationCodes` gains an optional
  `failedAttempts` field and the component exposes `reserveVerificationAttempt`.

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
