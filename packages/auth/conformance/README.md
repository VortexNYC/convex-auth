# convex-auth conformance suite

Live, **no-mocks** proofs that a `convex-auth` native deployment behaves
identically across every Convex project. Run these against any deployment
configured via env vars; pass = the deployment is conformant.

Every proof talks to the deployment over HTTP only (no consumer `api.*`
imports), so the suite drops into any project unchanged.

## What's covered

| Script                        | Proves                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prove-auth-lifecycle.ts`     | sign-up + identity restore, sign-out, ~60 s cookie/cache revocation bound, same-user sign-in (no duplicate), invalid token rejection, wrong-password rejection                                                                                                                                                                                                                                                                                        |
| `prove-breached-password.ts`  | Have I Been Pwned breach check: known-breached rejected, strong unique accepted (+ usable Convex token)                                                                                                                                                                                                                                                                                                                                               |
| `prove-2fa-full.ts`           | full TOTP matrix — enroll/verify/invalid-reject, sign-in round trip with session genuinely withheld pre-2FA, backup code + no-reuse, trusted device, disable, regenerate                                                                                                                                                                                                                                                                              |
| `prove-native-auth.ts`        | React Native / Expo token flow: JWT verified through Convex JWKS, breach + 2FA + sign-out + rate-limit all over native transport                                                                                                                                                                                                                                                                                                                      |
| `prove-captcha.ts` _(opt-in)_ | only meaningful if the deployment has captcha enabled — verifies the provider is gating sign-up + a real provider verification round trip                                                                                                                                                                                                                                                                                                             |
| `prove-social-login.ts`       | turnkey social login (Google first, provider-agnostic): the OAuth `signInWithRedirect` + `callback` flow is mounted and processing requests; a bogus provider yields a `4xx` error, **not** a 404 routing miss, proving the shared `/api/auth/callback/<provider>` route is wired. The live Google round trip requires a real OAuth client + interactive consent and is documented for manual testing; it is not automatable in this HTTP-only suite. |
| `prove-account-emails.ts`     | password-reset + email-verification transport seam: the `/api/auth/reset-password` and `/api/auth/verify-email` routes are mounted and accept the request (not 404/500). The actual `sendEmail` transport is verified at the unit level with a recording `sendEmail`.                                                                                                                                                                                 |
| `prove-webhooks.ts`           | webhook firing + delivery: subscription matching enqueues only subscribed/wildcard endpoints; HMAC-SHA256 signature verified by an independent verifier + tamper-rejected; delivery transition matrix. The live cron-driven HTTP round trip is proven separately by `scripts/prove-webhook-live-delivery.ts` against a deployment that mounts the component + the turnkey processor cron + a request-capture sink; it is not in the PR smoke gate.    |

## Usage

```bash
CONVEX_SITE_URL=https://<your>.convex.site \
CONVEX_URL=https://<your>.convex.cloud \
pnpm dlx tsx ./node_modules/convex-auth/conformance/prove-auth-lifecycle.ts
```

A pass exits 0 and prints `[SUCCESS]`; a fail exits 1 and lists the failed checks.

## Not included (project-specific)

Each project provides its own:

- API-key sensitive-action gate proof (depends on the project's `apiKeysSecure`
  module + its scope/permission model). Start from the same shape as the
  included conformance proofs.
- Frontend / UI tests.
