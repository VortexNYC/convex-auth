---
"@vortex-api/convex-auth": patch
---

fix(auth): spare the caller's whole session family in `revokeOtherSessions`

`revokeSessionsForUser` gains an optional `excludeFamilyId` arg, and the
`revokeOtherSessions` action now passes the caller's session family
(`familyId ?? sessionId`). Previously only the caller's exact
`sessionId` was excluded, so converged/rotated sibling sessions in the
same family were revoked — and a rotated sibling's post-grace replay
could still trigger family revocation that killed the caller's live
session. Excluding by family keeps the caller's entire session lineage
(sessions and refresh tokens) alive while other devices' families are
revoked.

Closes #356.
