---
"@vortex-api/convex-auth": patch
---

Fix `signOut` and `stopImpersonation` leaving sibling sessions live.

- **Fix:** after session-rotation convergence, one sign-in lineage can hold up to 10 live sibling sessions and refresh tokens in a single family. `signOut` and `stopImpersonation` revoked only the presented `sessionId`, so siblings kept minting sessions after "sign out". Both now revoke the whole family via the new `revokeSessionFamilyBySession` component mutation (shared with `stopImpersonation` in `admin/sessions`). Sessions from other sign-ins (other devices, other families) are untouched.
- Voluntary sign-out now writes a `session.sign_out` audit event; `stopImpersonation` keeps its `auth_admin_audits` entry and skips the system audit.
- `NativeSessionDoc` now declares `familyId` and `impersonatedBy`, matching the component schema.
