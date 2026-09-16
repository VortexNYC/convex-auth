---
"@vortex-api/convex-auth": minor
---

Harden session listing and revocation — session tokens are no longer returned to the client.

- `listSessions` items no longer include `token`; each item now carries `isCurrent: boolean` computed server-side. Raw session JWTs never leave the backend, so session lists, screenshots, and logs can't leak usable bearer credentials.
- `revokeSession` now takes `{ sessionId }` (the list item's `id`) and verifies the target session belongs to the caller before revoking. Previously it revoked whatever session a raw token named, with no ownership check.
- `ConvexSessionList` (web and React Native) no longer accepts `currentSessionToken` — the current-session badge and revoke suppression are driven by the server-computed `isCurrent` flag. Remove the prop; no replacement needed.

Migration: update any `revokeSession({ token })` calls to `revokeSession({ sessionId })`, and drop `currentSessionToken` from `<ConvexSessionList />` usages.
