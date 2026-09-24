---
"@vortex-api/convex-auth": major
---

`OidcProviderStorageAdapter.getSessionByToken` now requires `expiresAt` (#334)

Presence-based enforcement meant a lazy adapter returning `{ userId }` only
silently skipped session expiry. The field is now required at the type level.
The built-in component adapter always populates it; custom storage adapters
must return `expiresAt` — see `docs/(clients-and-migration)/v3-migration.md`.

Migration note: custom `OidcProviderStorageAdapter` implementations must return `expiresAt` (ms) from `getSessionByToken` — the field is now required.
