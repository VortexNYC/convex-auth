---
"@vortex-api/convex-auth": patch
---

Drop pre-`credentialId` session compat in `revokePasskeySessions` (#337)

Sessions minted before v2.4.0 lacked `credentialId` and were attributed to
a passkey by decoding `identityId` out of the stored session JWT. The
30-day refresh-TTL window has elapsed, so no such session can still be
live — the JWT-decode fallback, the `sessionTokenIdentityId` helper, the
`identityId` fallback on pending 2FA codes, and the covering test are
removed.
