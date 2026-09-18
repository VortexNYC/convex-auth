---
"@vortex-api/convex-auth": patch
---

Fix bounded first-page reads that could silently drop matching rows, plus index coverage for filtered lookups.

- **Security:** session-family revocation on refresh-token replay now paginates to exhaustion — in a family rotated past 1,000 refresh tokens, the live session and refresh token sat beyond the first index page and survived the fail-closed revocation.
- **Security:** `revokeSessionsForUser`, `revokeRefreshTokensForSession`, `revokeRefreshTokensForUser`, password-reset session revocation, and verification-code consume/revoke paths now read all matching rows — sessions, refresh tokens, and live codes beyond the first page previously survived revocation.
- `createVerificationCode` and email-verification code rotation now skip already-consumed rows instead of re-patching history.
- `authAccounts` gains a `by_user_provider_issuer` index; the admin password-set path and the matching `auth_identities` lookup now use exact index queries instead of `.take(100)` + post-filter.
- `organization_members` gains a `by_user_status` index; `listMembershipsByUser` with a `status` filter no longer under-fills pages when matching rows sit beyond the page bound.
