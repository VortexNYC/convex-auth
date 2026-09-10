---
"convex-auth": patch
---

Append the issued session `token`, `refreshToken`, and `sessionId` to the OAuth callback redirect URL. This lets `ConvexAuthProvider` hydrate the signed-in session from the URL, because the browser cannot read the `httpOnly` cookies set by the callback.
