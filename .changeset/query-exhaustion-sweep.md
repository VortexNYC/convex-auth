---
"@vortex-api/convex-auth": patch
---

Fix bounded first-page reads that could silently drop matching rows, plus index coverage for filtered lookups.

- **Security:** `revokeSessionsForUser` and `revokeVerificationCodesForUser` now paginate to exhaustion — a matching session or live code beyond the first 1,000 rows previously survived revocation.
- `authAccounts` gains a `by_user_provider_issuer` index; the admin password-set path and the matching `auth_identities` lookup now use exact index queries instead of `.take(100)` + post-filter.
- `organization_members` gains a `by_user_status` index; `listMembershipsByUser` with a `status` filter no longer under-fills pages when matching rows sit beyond the page bound.
