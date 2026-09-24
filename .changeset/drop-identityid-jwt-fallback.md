---
"@vortex-api/convex-auth": minor
---

Drop the `identityId`-from-JWT fallback in session refresh: sessions minted before the `authSessions.identityId` column (v2.5.1) have aged out under the 30-day refresh TTL, so refresh and converge resolve identity only from the session row. A session row without `identityId` now fails closed.
