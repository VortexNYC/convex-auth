---
"@vortex-api/convex-auth": minor
---

Component contract tightening:

- **Passkey options require a non-empty `origin`** — `generatePasskeyRegistrationOptions` and `generatePasskeyAuthenticationOptions` now reject calls without `origin` (or with an empty string/array), so every new challenge records its expected origin. Challenges created before this change still verify via the caller-supplied fallback during their TTL. The runtime wrapper already requires `origin` in config; **direct component callers must now pass it**.
- **Return validators filled in** — `generatePasskeyRegistrationOptions` (`v.any()` → record), `native/accounts` (`updateAccountTokens` → null, `createAccount` → id, `getAccountBySubject` → doc|null), `native/codes` (all four functions).
- **`rateLimits` honesty** — `recordAttempt`/`checkRateLimit` no longer emit `count` (the backing rate-limiter doesn't expose bucket counts; it was always `0`). `count` is now optional in the return type. `cleanupExpiredRateLimits` documented as a kept no-op for contract compatibility.
