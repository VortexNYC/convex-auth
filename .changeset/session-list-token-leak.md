---
"@vortex-api/convex-auth": minor
---

Harden session listing and revocation — session tokens are no longer returned to the client.

- `listSessions` items no longer include `token`; each item now carries `isCurrent: boolean` computed server-side. Raw session JWTs never leave the backend, so session lists, screenshots, and logs can't leak usable bearer credentials.
- `revokeSession` now takes `{ sessionId }` (the list item's `id`) and verifies the target session belongs to the caller before revoking. Previously it revoked whatever session a raw token named, with no ownership check.
- `ConvexSessionList` (web and React Native) no longer accepts `currentSessionToken` — the current-session badge and revoke suppression are driven by the server-computed `isCurrent` flag. Remove the prop; no replacement needed.
- **Security:** every session-validating path now rejects sessions with `revokedAt` set — session resolution, the token-verify action, bearer `/convex/token` and `/session` HTTP handlers, MCP OAuth authorize, OAuth account linking, and `verifySession` (which no longer falls back to an arbitrary active session when the session id is unknown).
- **Security:** two-factor pending challenges are opaque random tokens stored hashed in `authVerificationCodes` instead of signed JWTs — a pending challenge can no longer be replayed as a real Convex identity before 2FA completes.

Migration: update any `revokeSession({ token })` calls to `revokeSession({ sessionId })`, and drop `currentSessionToken` from `<ConvexSessionList />` usages.
