---
"convex-auth": minor
---

Add `deleteUser` to the native runtime with cascading cleanup of identities, accounts, sessions, refresh tokens, verification codes, organization memberships and orphaned organizations, API keys, service principals, webhooks, and MCP/MD registrations. Also add `by_createdBy` indexes to `service_principals` and `webhook_endpoints` to support efficient user-scoped cleanup.
