# Spec: Milestone 5 follow-up — remaining email-OTP flows

## Objective

Finish Better Auth `email-otp` parity by supporting the remaining OTP types: `email-verification`, `forget-password`, and `change-email`. These are user-bound flows, so they reuse `authVerificationCodes` instead of `authVerifiers`.

## Tech stack

- Convex actions and component `authVerificationCodes` mutations/queries.
- Existing email verification and password reset helpers in `provider.ts`.
- Existing `authVerifiers` for `sign-in` (already implemented).
- React `useAuthActions` for client helpers.

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
packages/auth/src/convex-runtime/native/emailOtp.ts          # extend with type-aware send/verify
packages/auth/src/convex-runtime/native/emailOtp.test.ts     # new tests for the three types
packages/auth/src/convex-runtime/native/provider.ts          # integration with verification codes
packages/react/src/ConvexAuthProvider.tsx                    # new client helpers
SPEC-milestone-5-email-otp-followup.md                       # this file
```

## Code style

- Flow through `sendVerificationOTP({ email, otp, type })`.
- Store SHA-256 hash of the OTP in `authVerificationCodes`.
- Consume codes atomically with `consumeVerificationCode`.
- Validate the email format and the `type` value.

## Testing strategy

- Unit tests for each `type`.
- Tests for invalid/expired/consumed OTPs.
- Tests for `change-email` updating the user and identity.
- Tests for `forget-password` returning a reset token or directly resetting.
- Full proof.

## Boundaries

- Always: validate email and OTP, normalize email, store only hashes.
- Ask first: changes to `authVerificationCodes` schema; direct `sendVerificationOTP` public shape changes.
- Never: store raw OTPs, allow consumed/expired codes, trust client for `emailVerified`.

## Success criteria

- `sendVerificationOtp` supports `email-verification`, `forget-password`, and `change-email`.
- `verifyEmailOtp` (or per-type actions) handles each flow.
- React provider exposes the actions.
- All tests pass.
- PR opened and merged to `main`.

## Build order

1. Refactor `emailOtp.ts` to support `type` in `sendVerificationOtp` and `verifyEmailOtp`.
2. Add per-type verification logic:
   - `email-verification` → call `verifyEmail` logic, mark `emailVerified`.
   - `forget-password` → return a reset token or create a `password_reset` verification code.
   - `change-email` → update `users.email` and `auth_identities` after verifying the new email.
3. Add React provider hooks for each type.
4. Add tests.
5. Run full proof and open PR.
