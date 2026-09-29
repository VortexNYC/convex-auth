---
"@vortex-api/convex-auth": minor
---

Add username/password authentication. `convexAuth({ username })` enables `signUpUsername` / `signInUsername` actions, `POST /api/auth/sign-up/username` and `/api/auth/sign-in/username` HTTP routes, `signUpUsername`/`signInUsername` SSR proxy intents, `useAuthActions().signUpUsername`/`signInUsername`, and `client.signUp.username`/`client.signIn.username` on the Better Auth-shaped client.

Users gain optional `username` (normalized, unique via `by_username`) and `displayUsername` (original casing) fields. `provisionFromIdentity` now rejects username collisions inside the serialized mutation with `duplicateField: "username" | "email"`, and exposes `getUserAndAccountByUsername`. Username identities use `provider: "username"`, `issuer: "native"` and are never linkable by email claim.

Sign-in shares the email/password pipeline: migrated bcrypt credentials rehash to argon2id on first verify (CAS-guarded), per-username rate limiting, and the same 2FA / trusted-device challenge flow. Optional `usernameValidator`, length bounds, `checkBreach`, `requireVerifiedEmail` (for attached emails), `captcha`, and `onExistingUserSignUp` are supported.
