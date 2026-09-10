# Spec: Milestone 3 catch-up — Better Auth OAuth parity

## Objective

Backfill the native OAuth runtime (GitHub and Google) so it matches the security and surface area that Better Auth's `signIn.social` / callback flow provides. Do not add new providers. The result should let a consumer drop in `convex-auth` native OAuth with the same guarantees as the Better Auth bridge.

## In scope

1. **Account linking policy**
   - Add `trustedProviders`, `accountLinking.enabled`, `accountLinking.disableImplicitLinking`, `accountLinking.requiresEmailVerification` to `NativeOAuthConfig`.
   - Before linking an OAuth identity to an existing user by email, check:
     - existing user found by email and no existing identity for this provider/issuer/subject.
     - provider is trusted OR `emailVerified` is true.
     - `accountLinking.enabled` is not `false` and `disableImplicitLinking` is not `true`.
   - If linking is denied, redirect with `error=account_not_linked`.

2. **Sign-up control and `requestSignUp`/`link` state**
   - Add `disableSignUp`, `disableImplicitSignUp` to provider config.
   - Add `requestSignUp?: boolean` and `link?: boolean` to OAuth state.
   - `handleCallback`:
     - If `disableSignUp` and user does not exist, redirect with `error=signup_disabled`.
     - If `disableImplicitSignUp` and user does not exist and `requestSignUp` is not `true`, redirect with `error=signup_disabled`.
     - If `link` is `true` and no existing session/user, redirect with `error=account_not_linked`.

3. **Email verification gating**
   - Add `requireEmailVerification?: boolean` to provider config.
   - If `true` and provider `emailVerified` is `false`:
     - Still create/link user and identity.
     - Do not create session.
     - Redirect with `error=email_not_verified`.

4. **Provider token storage**
   - Extend `authAccounts` schema with `accessToken`, `refreshToken`, `idToken`, `tokenType`, `scopes`, `accessTokenExpiresAt`, `refreshTokenExpiresAt`.
   - Encrypt or hash tokens before storage (use the existing `credentialHash` field as a JSON blob of encrypted/serialized token data to avoid a new column, or add explicit nullable columns).
   - Persist tokens from the token response after a successful callback.

5. **Specific OAuth error redirects**
   - Replace generic `callback_failed` with concrete error codes:
     - `invalid_callback_request`
     - `no_code`
     - `signup_disabled`
     - `email_not_verified`
     - `account_not_linked`
     - `provider_error` (when provider returns an error param)
     - `token_exchange_failed`

6. **Google parity**
   - Verify the `id_token` from the token response against Google's JWKS.
   - Support `accessType`, `prompt`, `display`, `loginHint`, `hd`, `includeGrantedScopes`, and `additionalParams` in `createGoogleProvider`.
   - Fall back to `userinfo` only when no `id_token` is returned.

7. **OAuth state fields**
   - State carries: `provider`, `codeVerifier`, `callbackURL`, `errorURL`, `newUserURL`, `requestSignUp`, `link`, `additionalData`.
   - `additionalData` is client-provided, untrusted, and preserved for callback side effects.

8. **Cookie shape**
   - Set `Max-Age` on the session cookie from `sessionTtlMs`.
   - Add `Secure` cookie option when `process.env.NODE_ENV === 'production'` or configurable.
   - Keep `HttpOnly; SameSite=Lax; Path=/`.

## Out of scope

- New OAuth providers.
- TOTP, magic links, OTP (Milestone 4).
- `getAccessToken` endpoint and background refresh (tracked, but not implemented until token storage lands).
- RP-initiated logout / `end_session_endpoint`.
- POST callback method (Apple) and direct `id_token` sign-in.
- Stateless account cookie mode.

## Commands

- `pnpm run typecheck`
- `pnpm exec vp check`
- `pnpm run build`
- `pnpm test`
- `pnpm --filter @vortex-api/convex-auth test -- src/convex-runtime/native/oauth.test.ts`

## Testing strategy

- Extend `oauth.test.ts` with:
  - account linking allowed/denied cases.
  - `disableSignUp` / `disableImplicitSignUp` / `requestSignUp`.
  - `requireEmailVerification`.
  - provider token storage on account.
  - Google `id_token` verification path and `access_type=offline`.
  - error redirect codes.
- Keep all existing GitHub tests passing.

## Boundaries

- Always: run the focused OAuth test suite and full proof before commit.
- Ask first: changing the `users` or `authAccounts` schema shape beyond adding nullable token fields.
- Never: commit real provider secrets or disable security gates to make tests pass.
