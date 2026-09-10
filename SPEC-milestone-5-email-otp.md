# Spec: Milestone 5 — Email-OTP sign-in

## Objective

Add native email-OTP (one-time password) sign-in to the `convex-auth` runtime, matching Better Auth's `email-otp` plugin sign-in flow. A user enters an email address, receives a short code, and the code creates or signs them in when submitted.

## Tech stack

- Convex components, mutations, actions, and HTTP actions.
- Web Crypto (`globalThis.crypto.getRandomValues`) for 6-digit numeric OTP generation.
- SHA-256 token hashing (`packages/auth/src/convex-runtime/native/tokens.ts`).
- Existing `authVerifiers` table with `type: "email-otp"` to store the hashed OTP and metadata.
- Existing session/token minting (`packages/auth/src/convex-runtime/native/jwt.ts`) and identity provisioning.

## Commands

```bash
pnpm run typecheck
pnpm run check
pnpm run build
pnpm test
pnpm --filter @vortex-api/convex-auth test -- src/convex-runtime/native/emailOtp.test.ts
```

## Project structure

```
packages/auth/src/convex-runtime/native/emailOtp.ts          # signInEmailOtp + verifyEmailOtp actions
packages/auth/src/convex-runtime/native/emailOtp.test.ts     # unit/flow tests
packages/auth/src/convex-runtime/native/tokens.ts            # generateEmailOtp helper
packages/auth/src/convex-runtime/native/convexAuth.ts        # wire emailOtp config
packages/auth/src/convex-runtime/native/provider.ts          # expose actions in NativeAuthActions/ConvexAuth
packages/react/src/ConvexAuthProvider.tsx                    # signInWithEmailOtp + verifyEmailOtp client helpers
```

## Code style

- Default Convex runtime for token generation and hashing; no Node crypto required.
- Store only the OTP hash, never the raw code, in `authVerifiers`.
- Consume verifiers atomically on successful verification.
- Response and error shapes follow Better Auth's `email-otp` plugin where practical.

## Testing strategy

- `emailOtp.test.ts`:
  - `signInEmailOtp` generates a 6-digit code, hashes it, stores an `email-otp` verifier, and calls `sendVerificationOTP`.
  - `signInEmailOtp` rejects invalid emails and disabled features.
  - `verifyEmailOtp` creates a new user on first use, signs in an existing user, and returns a session.
  - `verifyEmailOtp` rejects invalid, expired, and already-consumed OTPs.
  - `verifyEmailOtp` respects `disableSignUp`.

## Boundaries

- Always: run full proof before finishing the slice; store the OTP hash, not the raw code; normalize and validate email.
- Ask first: extending the `authVerifiers` table with an `attempts` column or adding non-sign-in OTP types (`email-verification`, `forget-password`, `change-email`).
- Never: store the raw OTP in the database; allow consumed/expired OTPs to create a session; trust client-provided `emailVerified` state.

## Success criteria

- `signInEmailOtp` action exists and calls `sendVerificationOTP({ email, otp, type: "sign-in" })`.
- `verifyEmailOtp` action consumes the verifier and creates/returns a session.
- `convexAuth` exposes `signInEmailOtp` and `verifyEmailOtp`.
- `ConvexAuthProvider` exposes `signInWithEmailOtp` and `verifyEmailOtp`.
- Typecheck, build, lint, and tests pass.

## Build order

1. Add `generateEmailOtp()` helper to `tokens.ts`.
2. Add `signInEmailOtp` and `verifyEmailOtp` actions in `emailOtp.ts`.
3. Wire `emailOtp` config in `convexAuth.ts` and return the new action refs.
4. Add `signInWithEmailOtp` and `verifyEmailOtp` to the React provider.
5. Run full proof and open PR.

## Open questions

- Should we limit attempts per verifier? For now, no attempt counting; the verifier expires and is consumed on success. Attempt limiting can be added later.
- Should the OTP length be configurable? First slice uses a fixed 6-digit numeric code, matching Better Auth's default.
- Should `signInEmailOtp` be gated by `disableSignUp` or `enabled`? It will respect `emailAndPassword.enabled === false` and a dedicated `emailOtp.disableSignUp` flag.
