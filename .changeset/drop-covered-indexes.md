---
"@vortex-api/convex-auth": patch
---

Drop covered prefix indexes flagged by `@convex-dev/eslint-plugin` v5 `no-duplicate-indexes`: `agent_hosts.by_organization`, `agents.by_organization`, `agents.by_host`, `agent_capability_grants.by_agent`, `agent_device_authorizations.by_agent`, `mcp_oauth_signing_keys.by_status`, `api_keys.by_organization_environment`, and `authAccounts.by_user`. Internal queries repointed to the covering indexes; prefix indexes that serve creation-ordered first-N list endpoints were kept with documented justifications. Index removals apply on the consumer's next `convex dev`/`push`.
