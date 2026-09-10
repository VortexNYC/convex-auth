# Spec: Milestone 5 — Magic-link sign-in

## Objective

Add native magic-link (email link) sign-in to the `convex-auth` runtime, matching Better Auth's `magic-link` plugin semantics. A user enters an email address, receives a link, and the link creates or signs them in when clicked.

## Tech stack

- Convex components, mutations, actions, and HTTP actions.
- Web Crypto (`globalThis.crypto.getRandomValues`) for random token generation.
- SHA-256 token hashing (reuses `packages/auth/src/convex-runtime/native/tokens.ts`).
- Existing email-sending config and helpers (`NativeEmailAndPasswordConfig.email.sendEmail`, `buildEmailVerificationUrl`).
- Existing session/token minting (`packages/auth/src/convex-runtime/native/jwt.ts`).

## Commands

```bash
pnpm run typecheck
pnpm run check
pnpm run build
pnpm test
pnpm --filter @vortex-api/convex-auth test -- src/convex-runtime/native/magicLink.test.ts
```

## Project structure

```
packages/auth/src/convex-runtime/native/magicLink.ts          # signInMagicLink + verifyMagicLink actions
packages/auth/src/convex-runtime/native/magicLink.test.ts     # unit/flow tests
packages/auth/src/convex-runtime/native/http.ts               # GET /magic-link/verify route
packages/auth/src/convex-runtime/native/provider.ts           # expose signInMagicLink action
packages/auth/src/convex-runtime/native/convexAuth.ts         # wire magicLink config
packages/auth/src/convex-runtime/native/types.ts              # NativeAuthSession / magic-link types; expose verifiers on component handle
packages/react/src/ConvexAuthProvider.tsx                     # add signIn.magicLink client helper
```

## Code style

- Default Convex runtime for token generation and hashing; no Node crypto required.
- Magic-link tokens are stored in the existing generic `authVerifiers` table with `type: "magic-link"`, because the user may not exist when the token is created and the table already provides create/get/consume semantics.
- HTTP routes stay thin and call actions; actions call component mutations for token and user/session creation.
- Response and error shapes follow Better Auth's `magic-link` plugin where practical.

## Testing strategy

- `magicLink.test.ts`:
  - `signInMagicLink` generates a token, stores it, sends an email, and rejects invalid emails.
  - `verifyMagicLink` creates a new user on first use, signs in an existing user, sets the session cookie, rejects consumed or expired tokens, and mitigates timing on unknown tokens.
  - Existing users get `emailVerified: true` after first sign-in.
- Conformance: manual verification that the `GET /magic-link/verify` route redirects with cookies.

## Boundaries

- Always: store token hash, not raw token; consume tokens atomically; hash before lookup; run full proof before finishing each slice.
- Ask first: changing the `authVerificationCodes` table for email-OTP later.
- Never: store the raw magic-link token in the database; allow token reuse; trust unverified client-provided `emailVerified` state.

## Success criteria

- `signInMagicLink` action exists and sends a valid verification URL.
- `GET /magic-link/verify` creates or signs in the user, sets cookies, and redirects.
- `convexAuth` exposes `signInMagicLink` and the HTTP route.
- `ConvexAuthProvider` exposes `authClient.signIn.magicLink`.
- Typecheck, build, lint, and tests pass.

## Build order

1. Expose `authVerifiers` create/get/consume functions on the component handle.
2. Add `signInMagicLink` action (token generation, hash, store in verifier, send email).
3. Add `verifyMagicLink` action (consume verifier, create/find user, create session).
4. Add `GET /magic-link/verify` HTTP route.
5. Wire `convexAuth` and `ConvexAuthProvider`.
6. Run full proof and open PR.

## Open questions

- Should `signInMagicLink` be gated by `disableSignUp` or `enabled`? For now it will respect `emailAndPassword.enabled === false` and `emailAndPassword.disableSignUp`.
- Should the magic-link email use `email.sendEmail` or a separate `magicLink.sendMagicLink`? The first slice will use a dedicated `magicLink.sendMagicLink` config function because it receives the link URL, not a pre-rendered email draft.
- A dedicated `authMagicLinkTokens` table may be introduced later; the first slice reuses `authVerifiers` to avoid a new component table and codegen churn.
