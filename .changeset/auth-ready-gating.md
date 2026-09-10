---
"convex-auth": patch
---

Wait for the Convex client auth `onChange` callback in `ConvexAuthProvider` before exposing `isAuthenticated` as true. This prevents child components from firing protected queries and mutations before `ctx.auth.getUserIdentity()` is ready, avoiding `Authentication required` races on initial load and after sign-in.
