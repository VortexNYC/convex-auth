---
"@vortex-api/convex-auth": minor
---

feat(auth): Google One Tap sign-in (#206)

Adds `convexAuth({ oneTap })` — verifies a Google Identity Services ID token
against Google's JWKS via the existing `createGoogleProvider` path (RS256,
iss/aud/exp, optional `hd`), then provisions the same `google` identity as
redirect OAuth so both flows resolve to one account.

- Server action `signInOneTap` with `disableSignUp`,
  `disableImplicitSignUp`, `requireEmailVerification`, nonce claim pinning,
  and per-subject rate limiting (on by default)
- `oneTap: true` inherits `clientId`/`hd`/`maxTokenAge`/`fetchImpl` from
  `oauth.google`; `clientSecret` is never required
- `useAuthActions().signInOneTap({ idToken })` on React and React Native,
  `signIn.oneTap({ idToken })` on the Better Auth client
- SSR cookie-mode support via the `signInOneTap` proxy intent and Next.js
  serialization
