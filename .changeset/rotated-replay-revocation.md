---
"@vortex-api/convex-auth": patch
---

fix(auth): scope refresh-token family revocation to rotated-token replay

Presenting a refresh token that was revoked administratively (sign-out,
`revokeOtherSessions`, admin revocation, passkey removal) no longer nukes
the entire session family — that response is reserved for replayed
_rotated_ tokens outside the grace window, the only case that is genuine
theft evidence (a rotated token has a live derived chain to contain). An
administratively revoked token was never rotated, so it minted no
descendants and quiet rejection loses no containment.

Previously, `revokeOtherSessions` (and friends) could be turned into a
denial-of-service against the legitimate caller: anyone replaying a killed
sibling token wiped the caller's family too.
