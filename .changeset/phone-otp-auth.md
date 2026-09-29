---
"@vortex-api/convex-auth": minor
---

Add phone-number sign-in via SMS OTP (`convexAuth({ phone })` → `sendPhoneOtp`/`verifyPhoneOtp`, `signIn.phoneOtp`). Numbers normalize to E.164, land on `users.phoneNumber`/`phoneNumberVerified` with a `by_phoneNumber` index, and provision a `phoneOtp` identity that fails closed on collisions. Session-gated `phone-verification` codes verify an existing account's number and link the `phoneOtp` identity. Reuses `createTwilioSmsOtpSender`; optional per-phone rate limiting on sends and verifies. Migration CLI now writes `username`/`displayUsername`/`phoneNumber`/`phoneNumberVerified` onto migrated users instead of dropping them.
