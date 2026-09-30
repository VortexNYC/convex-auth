---
"@vortex-api/convex-auth": patch
---

Make pending two-factor challenges retryable: a wrong TOTP or backup code
no longer consumes the challenge — it records a failed attempt and the user
can retry. After 5 failed attempts the challenge locks (consumed), so a
stolen pending token still can't be brute-forced indefinitely.
`authVerificationCodes` gains an optional `failedAttempts` field and the
component exposes `recordFailedVerificationAttempt`.
