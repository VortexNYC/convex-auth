---
"@vortex-api/convex-auth": patch
---

Make the remaining revoke paths session-family aware.

- **Fix:** the user-facing `revokeSession` action ("revoke this device" in the sessions list) revoked only the presented session row — sibling sessions minted by rotation convergence in the same sign-in family kept refreshing. It now revokes the whole family via `revokeSessionFamilyBySession`, writing a `session.revoke` audit event (distinct from `session.sign_out`).
- **Fix:** admin `revokeSession` had the same single-row hole — it now revokes the presented session's entire family. The admin audit entry is unchanged and now records `familyId` in its payload.
- **Fix:** `revokeSessionsForUser` (backing `revokeOtherSessions`) now marks the revoked sessions' refresh tokens `revokedAt` too. They were already dead — `rotateSession` refuses tokens whose session row is revoked — but the marker keeps the token table honest and replay detection accurate. The excluded session's tokens are spared.
- `revokeSessionFamilyBySession` accepts an optional `auditEventType` (defaults to `session.sign_out`).

Closes #346.
