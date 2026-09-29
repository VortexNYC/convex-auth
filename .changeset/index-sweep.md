---
"@vortex-api/convex-auth": patch
---

perf: index sweep — passkey revocation now reads `authSessions` through `by_credential_id` instead of scanning every session for the user, and 17 never-referenced index declarations (16 unique names) are removed across `users`, `auth_identities`, `auth_admin_audits`, `webhook_deliveries`, `auth_passkeys`, `organization_members`, `agent_auth_audit_events`, `auth_md_*`, and `mcp_oauth_signing_keys` (one-line re-add if a query path lands for them)
