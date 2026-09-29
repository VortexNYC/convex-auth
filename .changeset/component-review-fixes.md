---
"@vortex-api/convex-auth": patch
---

Component review hardening — three correctness fixes:

- **OAuth `requireEmailVerification` ordering**: the check now runs before `provisionFromIdentity` and account-token writes, so a denied sign-in no longer leaves orphaned user/identity rows or overwrites stored OAuth tokens on a rejected request.
- **`provisionFromIdentity` linking invariant**: implicit email-match linking now requires `identity.emailVerified === true` — callers can no longer link an unverified provider email into an existing account via the default `allowLink: true`. The `trustedProviders` escape is preserved through a new explicit `allowUnverifiedEmailLink` arg. Provisions can no longer downgrade a verified user's `emailVerified` flag (monotonic).
- **Admin `listUsers` search**: partial substring search now works — the previous path exact-matched `by_email`/`by_name` then substring-filtered the already-exact set, so partial terms silently returned nothing. Search now paginates with `filterWith` (matching the admin audit pattern) and supports cursors.
