---
"@vortex-api/convex-auth": patch
---

fix(auth): bind OAuth/magic-link session landings to the initiating browser

Session-triple landings (`?token=&refreshToken=&sessionId=`) carry an
already-minted session in the URL — bearer credentials anyone holding the
link can land, enabling cross-browser login CSRF (an attacker completes
their own flow and feeds the victim the landing URL).

The flow now binds the session to the browser that started it via a
non-HttpOnly `__convexAuthLandingVerifier` cookie (`__Host-` prefixed off
localhost). The SSR boundary mints it on same-origin navigations; the
React client attaches it to OAuth sign-in (carried in the signed state)
and magic-link requests (stored on the verifier record). Callback/verify
routes echo it onto the landing URL, and the boundary writes auth cookies
only when it matches the cookie — mismatched or absent verifiers strip
the session params instead. The proxies inject the cookie value (never
the request body) into `callback` action args so a forged body cannot
substitute it.

Rejected landings are surfaced, not silent: the stripped-URL redirect
carries `?error=landing_verifier_mismatch` (or `?error=cross_origin`
when a credentialed cross-origin request carried the triple), so apps
can render a real error — e.g. a magic link opened in a different
browser — instead of appearing signed-out. The token-mode provider
writes the same param on its client-side URL cleanup.

Opt out per-deployment with `requireLandingVerifier: false` on the
middleware/boundary — for releases that predate verifier threading or
rely on opening magic links in a different browser. Token-mode web
clients bind the same way client-side (the provider checks the URL
param against the cookie before ingesting a session triple; pass
`requireLandingVerifier={false}` to opt out). React Native and other
non-DOM runtimes never bind — there is no cookie jar to compare
against.

Closes #355.
