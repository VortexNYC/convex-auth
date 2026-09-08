---
title: Consumer contract
description: Rules for keeping consumer-owned tables separate from convex-auth component tables.
sidebar:
  order: 23
---

# Consumer contract

`convex-auth` owns the tables for organizations, members, roles, invitations, API keys, agents, and service auth. Consumers must not re-create those tables locally. Instead, they keep a local `organizations` anchor and foreign-key domain rows to it.

## Why it exists

If a consumer mirrors `organization_members` or `api_keys` in its own Convex schema, the two sources of truth will diverge. The consumer-contract guardrail detects those mirrors in CI and fails the build before they ship.

## What is forbidden

### Local defineTable for component-owned tables

```ts
// BAD: convexAuth owns this table
export const organization_members = defineTable({
  // ...
});
```

Forbidden tables include:

- `organization_members`, `organization_roles`, `organization_invitations`
- `api_keys`
- `agent_hosts`, `agent_host_keys`, `agents`, `agent_keys`
- `agent_capability_grants`, `agent_replay_records`
- `agent_device_authorizations`, `agent_device_authorization_attempts`
- `agent_auth_audit_events`
- `auth_md_registrations`, `auth_md_assertions`, `auth_md_credentials`, `auth_md_audit_events`

### Local writes into component tables

```ts
// BAD: do not insert directly into component-owned tables
await ctx.db.insert("organization_members", { ... });
```

### Bidirectional mirror writers

Do not define functions like `ensureConvexAuthMember` or `ensureConvexAuthApiKey`. Only `ensureConvexAuthOrganization` (the anchor mapper) is allowed.

## What is allowed

### The `organizations` anchor

Consumers may have a local `organizations` table with bridge columns like `convexAuthOrganizationId`. This is the single place where the consumer maps its domain concept to a `convex-auth` organization.

```ts convex/schema.ts
const organizations = defineTable({
  name: v.string(),
  convexAuthOrganizationId: v.optional(v.string()),
});
```

### Reading from the component

Consumers call component queries and actions to read members, roles, invitations, API keys, etc. They do not duplicate the data.

### One-way event caches

Consumers may keep a one-way cache of events (e.g., `organizationMemberJoined`) for domain logic, but not a mirror of the current state.

## CI guardrail

Run `scripts/check-consumer-contract.ts` against your `convex/` directory:

```bash
pnpm dlx convex-auth check-consumer-contract --convex-dir convex
```

The script returns a list of violations with file, line, and rule. Fix them before merging.

## See also

- [Feature-gated components](./feature-gated-components)
- [Organizations](./organizations)
