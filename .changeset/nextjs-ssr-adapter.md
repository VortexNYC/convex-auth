---
"@vortex-api/convex-auth": minor
---

Add a Next.js SSR adapter with HttpOnly cookie sessions.

- **New:** `packages/auth/src/nextjs` exports the App Router surface — a route-handler proxy (`/api/auth`), middleware for protected routes and proactive refresh, server-side session reads, and server-action support. Sessions live in HttpOnly cookies; tokens never reach client JS.
- **Demo:** `examples/nextjs` is a working App Router app (sign-in/up, protected dashboard, session-triple landing, sign-out) verified end-to-end against a local Convex deployment.
- SSR renders verify the session server-side and fail closed: expired or revoked sessions redirect to sign-in instead of flashing authenticated UI.
