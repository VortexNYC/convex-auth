# Spec: Native multi-provider CAPTCHA for `convex-auth`

## Objective

Add a `captcha` option to `convexAuth` that validates challenge tokens before sensitive email/password endpoints, matching the Better Auth captcha plugin surface. Support the same four providers so consumers can migrate without losing bot protection.

Primary consumers: existing Better Auth users migrating to `convex-auth` and new consumers who want bot protection on sign-up / password-reset.

## Providers

- `cloudflare-turnstile`
- `google-recaptcha`
- `hcaptcha`
- `captchafox`

Cloudflare Turnstile is the reference/free default because it has a generous free tier and is used in the Better Auth docs example.

## Tech stack

- Provider verification: Convex `action` with `fetch` to each provider's `siteverify` endpoint.
- Config: passed into `convexAuth({ captcha: { provider, secretKey, endpoints? } })`.
- Gate endpoints: by default `/api/auth/sign-up/email`, `/api/auth/sign-up`, and `/api/auth/request-password-reset`.
- Header: `x-captcha-response` (Better Auth-compatible). Body field `captchaToken` also accepted for non-browser clients.

## Project structure

```
packages/auth/src/convex-runtime/native/
  captcha.ts              # provider types, siteverify URLs, verifyCaptchaToken helper
  captcha.test.ts         # unit tests for provider dispatch and response parsing
  provider.ts             # signUp/sendPasswordReset accept optional captchaToken, call verifier
  http.ts                 # read x-captcha-response header / captchaToken body, pass to actions
  convexAuth.ts           # accept captcha config, thread secret key env var, pass to routes
  types.ts                # extend NativeEmailAndPasswordConfig with captcha option
packages/auth/conformance/
  prove-captcha.ts        # enable captcha in dev deployment, test without/with token
```

## Code style

- No `any`. Use validators for `args` and provider response parsing.
- Use `parse` from `convex/values` for the provider JSON response shapes.
- Siteverify URLs are constants; provider dispatch is a switch, not dynamic imports.
- Keep the gate opt-in: if `captcha` is omitted, behavior is unchanged.

## Testing strategy

- Unit tests in `captcha.test.ts`:
  - each provider's `siteverify` request is constructed with correct `secret`, `response`, and optional `remoteip`.
  - success/failure response parsing maps to `verified` boolean.
  - missing token throws before any fetch.
- Integration in `provider.test.ts`:
  - `signUp` with `captchaToken` and enabled captcha calls the verifier and succeeds/fails.
  - `sendPasswordReset` gated the same way.
- Conformance `prove-captcha.ts`:
  - without captcha config, probe succeeds and proof skips.
  - with captcha enabled, sign-up without token is rejected; with test token it dispatches to provider.
  - sign-in remains deliberately ungated (non-regression).

## Boundaries

- **Always:** keep captcha strictly opt-in; default behavior unchanged.
- **Always:** fail closed — if captcha is enabled and verification fails, reject the request.
- **Ask first:** adding a new CAPTCHA provider outside the four listed here.
- **Never:** store the `secretKey` in code; it comes from `process.env` in the consumer's `convex/auth.ts`.

## Success criteria

- `convexAuth({ captcha: { provider: "cloudflare-turnstile", secretKey: process.env.TURNSTILE_SECRET_KEY } })` compiles and gates sign-up.
- `pnpm run check && pnpm run typecheck && pnpm run test` pass.
- `prove-captcha.ts` runs against the dev deployment and reports `[SUCCESS] captcha` when configured.
- The `sign-in` endpoint is not gated, preserving programmatic/MCP callers.

## Open questions

1. Do we expose the captcha gate to `sendEmailVerification` and `two-factor` endpoints? _(Default: no; match Better Auth defaults `["/sign-up/email", "/sign-in/email", "/request-password-reset"]`; sign-in is intentionally NOT gated.)_
2. Should the React provider / `useAction` automatically include a client-side Turnstile widget, or is that the consumer's responsibility? _(Default: consumer responsibility; `convex-auth` only validates the token server-side.)_
