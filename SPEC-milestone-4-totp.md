# Spec: Milestone 4 — Native TOTP two-factor authentication + backup codes

## Objective

Add native TOTP (RFC 6238) two-factor authentication with backup codes to the `convex-auth` native runtime. The implementation must satisfy the existing `packages/auth/conformance/prove-2fa-full.ts` conformance proof and align with Better Auth's `twoFactor` plugin semantics.

## Tech stack

- Convex components, queries, mutations, actions, HTTP actions.
- Web Crypto (`globalThis.crypto.subtle`) for HMAC-SHA1, random secret generation, and token hashing.
- Pure-JS base32 encoder/decoder (RFC 4648) so the default Convex runtime needs no Node crypto.
- `jose` for JWT session minting, existing `packages/auth/src/convex-runtime/native/jwt.ts`.
- Existing `packages/auth/src/convex-runtime/native/oauthCrypto.ts` for at-rest AES-GCM encryption of the TOTP secret.
- Argon2id hashing for backup codes via the existing Node-only `password.ts` action (backup-code verification is a Node action).

## Commands

```bash
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm test
pnpm --filter @vortex-api/convex-auth test -- src/convex-runtime/native/twoFactor.test.ts
```

## Project structure

```
packages/auth/src/convex-runtime/native/totp.ts              # TOTP algorithm + base32 + utilities
packages/auth/src/convex-runtime/native/totp.test.ts         # Unit tests for TOTP/base32
packages/auth/src/convex-runtime/native/twoFactor.ts         # HTTP routes and helpers for 2FA
packages/auth/src/convex-runtime/native/twoFactor.test.ts    # Full 2FA flow tests
packages/auth/src/convex-runtime/native/provider.ts          # sign-in returns pending token when 2FA enabled
packages/auth/src/convex-runtime/native/http.ts              # add /api/auth/two-factor/* routes
packages/auth/src/component/schema.ts                        # add TOTP columns/tables
packages/auth/src/component/identity.ts                      # carry new user fields
packages/auth/src/component/twoFactor.ts                     # component mutations/queries
packages/auth/conformance/prove-2fa-full.ts                  # acceptance conformance proof
```

## Code style

- Default runtime for Web Crypto TOTP and base32; Node only for backup-code Argon2id.
- Constants and types mirror existing native files (`tokens.ts`, `oauthCrypto.ts`).
- HTTP routes stay thin; helpers/actions contain the logic.
- All new mutations are atomic; use single component mutation calls.

## Testing strategy

- `totp.test.ts`: base32 round-trip, hotp/totp generation, code verification with drift, invalid codes, issuer/label URI.
- `twoFactor.test.ts`: enable, verify-totp, verify-backup-code, disable, generate-backup-codes, trusted device, sign-in gating, used-backup-code rejection.
- Conformance: `prove-2fa-full.ts` must pass against a deployed native auth HTTP stack.

## Boundaries

- Always: keep TOTP secret encrypted at rest; keep backup codes hashed; run full proof before finishing each slice.
- Ask first: removing or renaming existing `emailTwoFactor*` schema fields; changing `sign-in` response shape beyond adding `twoFactorRedirect`.
- Never: store TOTP secrets in plain text; allow backup code reuse; trust client-provided `twoFactorEnabled` for org MFA checks.

## Success criteria

1. `POST /api/auth/two-factor/enable` (with password) returns `totpURI` (otpauth://) and an array of `backupCodes`.
2. `POST /api/auth/two-factor/verify-totp` confirms a 6-digit TOTP code and fully enables 2FA.
3. `POST /api/auth/sign-in/email` returns `twoFactorRedirect: true` and a pending cookie when 2FA is enabled.
4. `POST /api/auth/two-factor/verify-totp` with the pending cookie issues a real session.
5. `POST /api/auth/two-factor/verify-totp` with `trustDevice: true` sets a trusted-device cookie; the next sign-in does not challenge.
6. `POST /api/auth/two-factor/verify-backup-code` completes sign-in and the same code is rejected on reuse.
7. `POST /api/auth/two-factor/disable` (with password) removes 2FA and future sign-ins are unchallenged.
8. `POST /api/auth/two-factor/generate-backup-codes` (with password) returns new codes and invalidates the old set.
9. TOTP secret is AES-GCM encrypted in the database; backup codes are Argon2id-hashed.
10. Full `typecheck`, `lint`, `build`, and `test` green.

## Open questions

- Should we add a separate `authTwoFactor` table or extend `users`? For the first slice, extend `users` with `twoFactorEnabled`, `twoFactorSecret` (encrypted), `twoFactorBackupCodes` (hashed strings), and reuse the existing `authVerificationCodes` table with `two_factor_pending` and `two_factor_trusted_device` types for pending challenges and trusted-device tokens.
- Should trusted-device tokens expire? Yes: 30 days by default, configurable.
- Do we need issuer/label customization in `totpURI`? Default to `process.env.SITE_URL` or `Convex` for issuer and user email for label.
