---
"convex-auth": patch
---

Add Convex `by_expires_at` indexes to `authSessions` and `authRefreshTokens`, expose `cleanupExpiredSessions`, `cleanupExpiredRefreshTokens`, and `cleanupAuthAuditEvents` for cron-based retention, and include `JWT_PRIVATE_KEY`/`JWKS` in the preflight env checks.
