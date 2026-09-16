---
"@vortex-api/convex-auth": minor
---

Harden and extend passkeys: ownership enforcement, cloned-credential detection, rename, and per-user limits.

- **Security:** passkey management (register, list, revoke, rename) is now bound to `ctx.auth.getUserIdentity()` — callers can only operate on their own passkeys.
- **Security:** authentication challenges scoped to a user can only be completed by a credential owned by that user.
- **Security:** a non-increasing signature counter revokes the passkey and writes a `passkey_counter_regression` audit event (cloned-authenticator detection).
- New `renamePasskey` mutation, exposed through `auth.renamePasskey`, `usePasskeys().rename`, and an optional `onRename` prop on `PasskeyManager`.
- `passkey.maxPasskeysPerUser` config caps active passkeys per user (default 10).
- `passkey.origin` accepts `string | string[]` for multi-origin apps; `attestationType`, `userVerification`, `residentKey`, and `authenticatorAttachment` are now configurable.
- `usePasskeys({ autofill: true })` enables WebAuthn conditional UI (browser autofill) sign-in.
- Passkey-issued sessions/refresh tokens now carry `familyId`, so they participate in refresh-token reuse detection.
- Audit events are written for `passkey_registered`, `passkey_authenticated`, `passkey_renamed`, and `passkey_revoked`.
- **React Native / Expo passkeys**: new `usePasskeys` hook under `@vortex-api/convex-auth/react-native/passkeys`, backed by the optional `react-native-passkeys` peer dependency (ASAuthorizationController on iOS, Credential Manager on Android). Native ceremonies return SimpleWebAuthn-compatible JSON verified by the same actions as web; configure `passkey.origin` with every platform origin (web origin plus `android:apk-key-hash:<hash>`).
