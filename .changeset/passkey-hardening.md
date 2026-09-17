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
- **Security:** sessions minted by a passkey now record `credentialId` — revoking a passkey (or detecting a cloned authenticator via counter regression) revokes every session and refresh token that passkey created.
- **Security:** challenges record the `rpID`, accepted `origin`s, and effective identifier at generation time; verification uses the stored values, so config changes or client-supplied arguments can't weaken a pending ceremony.
- **Security:** the per-user passkey cap counts all active rows (revoked rows can no longer starve the page and bypass the cap) and is re-checked at verification time.
- **Security:** passkey session and refresh-token lifetimes now follow `passkey.sessionTtlMs` / `passkey.refreshTokenTtlMs` (defaulting to the native-auth 7d/30d), matching password and OAuth flows.
- **Security:** when `userVerification` is relaxed and the account has TOTP 2FA enabled, passkey sign-in returns the standard `twoFactorRedirect` challenge instead of minting a session — UV-verified ceremonies still satisfy 2FA on their own. The pending challenge carries `credentialId`, so the session minted after TOTP stays bound to the passkey and remains revocable with it.
- **Security:** passkey revocation paginates all session/refresh-token lookups to exhaustion and attributes pre-`credentialId` sessions by decoding the `identityId` embedded in the stored session JWT — revocation covers legacy rows and arbitrarily large session families without touching unrelated password sessions.
- **Security:** revoking a passkey consumes its in-flight two-factor pending challenges, closing the race where a challenge issued before revocation could mint a session after it.
- Expired passkey challenges are garbage-collected when new options are generated.
- `usePasskeys` (web and React Native) fetches ceremony options when `register`/`signIn` is invoked instead of on mount — challenges can no longer go stale in component state.
- Audit events are written for `passkey_registered`, `passkey_authenticated`, `passkey_renamed`, and `passkey_revoked`.
- **React Native / Expo passkeys**: new `usePasskeys` hook under `@vortex-api/convex-auth/react-native/passkeys`, backed by the optional `react-native-passkeys` peer dependency (ASAuthorizationController on iOS, Credential Manager on Android). Native ceremonies return SimpleWebAuthn-compatible JSON verified by the same actions as web; configure `passkey.origin` with every platform origin (web origin plus `android:apk-key-hash:<hash>`). Ceremony results are normalized before hitting the wire — the library's `getPublicKey()` method and platform `null` optional fields are stripped so verification succeeds on real devices. Validated end-to-end on iOS and Android (register → sign-in → revoke → revoked-credential rejection).
