---
"@vortex-api/convex-auth": patch
---

Make pending two-factor challenges retryable: a wrong TOTP or backup code
no longer consumes the challenge — it records a failed attempt and the user
can retry. Verification attempts are reserved atomically before the code is
checked, so after 5 attempts the challenge stops accepting guesses even
under concurrent requests. `authVerificationCodes` gains an optional
`failedAttempts` field and the component exposes `reserveVerificationAttempt`.
