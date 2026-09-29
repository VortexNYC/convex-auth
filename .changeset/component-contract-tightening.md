---
"@vortex-api/convex-auth": patch
---

Component contract tightening:

- **Passkey options require `origin`** — `generatePasskeyRegistrationOptions` and `generatePasskeyAuthenticationOptions` now reject calls without `origin`, so every stored challenge carries its expected origin and verification can't fall back to a caller-supplied value. The runtime wrapper already passes `origin` from server config; only direct component callers are affected.
- **Return validators filled in** — `generatePasskeyRegistrationOptions` (`v.any()` → record), `native/accounts` (`updateAccountTokens` → null, `createAccount` → id, `getAccountBySubject` → doc|null), `native/codes` (all four functions).
- **`rateLimits` honesty** — `recordAttempt`/`checkRateLimit` no longer emit `count` (the backing rate-limiter doesn't expose bucket counts; it was always `0`). `count` is now optional in the return type. `cleanupExpiredRateLimits` documented as a kept no-op for contract compatibility.
