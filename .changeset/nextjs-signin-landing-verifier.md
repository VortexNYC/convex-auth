---
"@vortex-api/convex-auth": patch
---

Fix proxied password/username sign-in rejecting the cookie-substituted `landingVerifier` with `ArgumentValidationError`. The SSR proxy substitutes the landing verifier from its cookie into `signIn`, `signInUsername`, and `callback` args; the two password actions never declared the field, so every cookie-mode sign-in 400'd once a verifier cookie existed (the middleware mints one on any navigation). Both actions now accept and echo it into the session result, matching the `nativeAuthSessionValidator` contract used by the component's redirect-stamping routes. Also fixes `getConvexNextjsOptions` emitting `{ url: undefined }` when callers pass `convexUrl` as a present-but-unset key — `convex/nextjs` warns "deploymentUrl is undefined" on every call with an explicit `undefined` and will treat it as an error in a future release; omitting the key preserves the `NEXT_PUBLIC_CONVEX_URL` env fallback cleanly.
