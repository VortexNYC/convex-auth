---
"@vortex-api/convex-auth": patch
---

`convex-auth preflight` now validates `convex/auth.config.ts` — presence plus the canonical `createConvexAuthProvider` wiring — via a new `providerConfigPath` backend-setup option wired in the CLI's `backendSetupFromConvexDir`. The existing "Convex auth config" slot validates `auth.ts` (the `convexAuth()` callsite) and its default path is corrected to `convex/auth.ts` to match; previously it pointed at `convex/auth.config.ts` while requiring a `convexAuth` snippet that file never contains, so programmatic callers with defaults could false-fail it.

Nothing validated `auth.config.ts` before this change, which let a real consumer-facing bug ship: without the provider registration, Convex rejects any request carrying a session JWT as caller auth with `NoAuthProvider` **before the function runs** — proxied `signOut` cleared cookies and returned 400 while the server-side session stayed valid, so a stolen cookie pair remained live after "logout". `convex-auth check`/bug-report already diagnosed the file; preflight now fails on its absence too.

Heads-up for consumers running `convex-auth preflight` or `auth:preflight`: a previously green run will now fail if `convex/auth.config.ts` is missing or lacks `createConvexAuthProvider` — that failure is the check working (the file is required wiring); `--skip-backend-setup` remains the escape hatch.
