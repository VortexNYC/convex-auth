---
"@vortex-api/convex-auth": patch
---

Fix concurrent session refresh destroying sessions, and make refresh work for non-password identities.

- **Fix:** two parallel requests presenting the same refresh token (the normal SSR pattern: two server handlers holding the same cookie) no longer destroy the session. The second request used to observe the rotated token's `revokedAt`, classify it as replay, and revoke the whole family — including the pair the first request had just minted. `rotateSession` now marks `rotatedAt` on rotation and reports `"converge"` for a just-rotated predecessor inside a 15-second grace window; the new `convergeSession` mutation mints a bounded sibling session+refresh pair in the same family.
- **Security bounds on convergence:** at most 8 grace redemptions per predecessor row, at most 10 live sessions per family (bounded `by_family` scan), and convergence requires at least one live family member — sign-out, password reset, or replay revocation during the window kills the grace with the family, so a stolen predecessor cannot resurrect it. Refused redemptions write `refresh_token_grace_exhausted` audit events; out-of-window and never-rotated replays still revoke the family.
- **Fix:** `updateSession` (refresh) now resolves the identity from the session JWT claim via `getIdentityById`, so sessions minted through OAuth and passkeys refresh correctly. Previously the refresh path hardcoded a `password`/`native` identity lookup and failed for every other provider; the old lookup remains only as a fallback for legacy sessions whose tokens predate the claim.
- `authRefreshTokens` gains optional `rotatedAt` and `graceRedemptions` fields (backwards compatible — existing rows simply have them unset).
