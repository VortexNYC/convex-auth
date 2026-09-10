# Convex auth component directory — internal analysis

**Goal:** Systematically compare every component in the Convex auth directory against `@vortex-api/convex-auth` so we can say, with evidence, where we are ahead and where we have gaps.

**Source:** https://www.convex.dev/components/categories/auth (16 components + the official `@convex-dev/auth` and `@convex-dev/better-auth` packages).

## The short version

| If you want...                         | The component-directory way                       | The `@vortex-api/convex-auth` way                |
| -------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| Password + OAuth + 2FA + sessions      | Install 2–4 packages and wire them                | One package, one component, shared tables        |
| Organizations, members, invites, roles | Add a tenants/permissions/invites component stack | Already included, tied to the same user identity |
| API keys for users and orgs            | Add a separate API-keys component                 | Built-in, scoped to users and organizations      |
| MCP/agent OAuth flows                  | Add an OAuth-provider component                   | Built-in MCP OAuth server + agent-auth protocol  |
| Better Auth migration                  | Rewrite your data model                           | One-time `migrate better-auth` CLI command       |

## 1. Official / framework options

| Component / service                                | What it does                                                                                                                                                                 | Compared to `@vortex-api/convex-auth`                                                                                                                                                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@convex-dev/auth` (get-convex/convex-auth)        | Official Convex Auth library. Client-side React/React Native auth with email/password, OAuth, OTP, and magic links. Beta, no built-in UI, no orgs, no API keys, no webhooks. | **Ahead.** Same native philosophy, but `@vortex-api/convex-auth` ships the full B2B control plane (orgs, members, roles, invitations, API keys, webhooks, MCP OAuth, agent auth) and a migration bridge from Better Auth. |
| `@convex-dev/better-auth` (get-convex/better-auth) | Runs the full Better Auth runtime inside Convex.                                                                                                                             | **Ahead.** Same feature surface, but reimplemented as native Convex actions and tables, plus a one-time data migration out of Better Auth. No Better Auth runtime in production.                                          |
| WorkOS AuthKit (get-convex/workos-authkit)         | Syncs WorkOS AuthKit users/orgs into Convex via webhooks.                                                                                                                    | Different use case — external provider sync. Convex Auth keeps the source of truth inside Convex. Use WorkOS only if the company already standardizes on it.                                                              |
| Kinde Sync (sholajegede/kinde-sync)                | Syncs Kinde auth events into Convex via webhooks.                                                                                                                            | Same pattern as WorkOS AuthKit. Convex Auth gives the same user/org data without a third-party dependency.                                                                                                                |

## 2. Components we directly replace

| Component                                                                                                    | What it does                                                            | Why we are ahead                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| convex-passkey-auth (TimpiaAI)                                                                               | WebAuthn passkeys, self-minted JWTs, sessions.                          | Passkeys are a sign-in method, not a full auth platform. `@vortex-api/convex-auth` covers the full auth lifecycle and can add passkey support; the reverse is not true.                                    |
| convex-authz (dbjpanda)                                                                                      | Zanzibar RBAC/ABAC/ReBAC, O(1) lookups, audit logging, expiring grants. | We cover RBAC natively for orgs/members/roles. If a customer needs full Zanzibar graph traversal, convex-authz is excellent; for the 95% use case we already have it.                                      |
| convex-tenants (dbjpanda)                                                                                    | Multi-tenant orgs/teams built on convex-authz.                          | Organizations, members, roles, and invitations are already in `@vortex-api/convex-auth` with one shared user model.                                                                                        |
| API Keys (vllnt/convex-api-keys), Convex Api Keys (gaganref/convex-api-keys), convex-api-keys (akshatsinha0) | Standalone API key management components.                               | Our API keys are integrated with users, orgs, and the auth audit trail. Dedicated components are good for pure public-API key infra; ours is better when keys belong to authenticated users and orgs.      |
| Permissions (RBAC) (vllnt/convex-permissions)                                                                | Typed, runtime-editable RBAC with wildcard grants.                      | We bundle RBAC with the user/org model. No separate component needed for org-level role checks. For generic auth-agnostic permission modeling, convex-permissions is a focused alternative.                |
| Memberships (vllnt/convex-memberships)                                                                       | ReBAC membership tuples, group/resource graph.                          | We handle org membership and invitations. For arbitrary relationship graphs outside users/orgs, convex-memberships is a useful primitive.                                                                  |
| convex-invite-links and convex-invite (TimpiaAI / dciccale)                                                  | Generic invite links and membership management.                         | We already include organization invitations with email locking, role assignment, and lifecycle tracking. The standalone components add extras like social-preview URLs and generic group/resource invites. |

## 3. Add-on / specialized components

| Component                               | What it does                                                                                         | Relationship to `@vortex-api/convex-auth`                                                                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| oauth-provider (codefox-inc)            | Turns your Convex app into an OAuth 2.1 / OIDC provider for MCP clients and third-party apps.        | Complementary. We are an OAuth client for Google/GitHub/Discord and implement MCP OAuth for agent auth. If someone needs a general-purpose OIDC provider, oauth-provider is a focused solution. |
| API Tokens (TimpiaAI/convex-api-tokens) | Encrypted third-party API token storage (Stripe, OpenAI keys, etc.) with lifecycle and idle timeout. | Different problem — a secrets vault for _external_ API keys. We issue keys _to_ callers, not store our own third-party credentials.                                                             |
| Secret Tokens (vllnt/convex-tokens)     | Hashed secret token primitive.                                                                       | Subset of our API keys. We provide the same hashed-token semantics inside an integrated auth/org model.                                                                                         |

## 4. Gaps to close or decide on

| Capability                                                 | Offered by                                           | Our status                                                 | Decision needed                                                                               |
| ---------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Passkeys / WebAuthn**                                    | convex-passkey-auth                                  | Not implemented.                                           | Add as an identity provider? High-value differentiator.                                       |
| **Full Zanzibar / ReBAC / ABAC**                           | convex-authz, convex-permissions, convex-memberships | RBAC only.                                                 | Keep focused on org RBAC; document when to add convex-authz as a companion.                   |
| **Generic OIDC / OAuth 2.1 provider**                      | oauth-provider                                       | MCP OAuth provider exists; general OIDC provider does not. | Decide if we want to extend MCP OAuth into a general provider or partner.                     |
| **External provider sync**                                 | WorkOS AuthKit, Kinde Sync                           | Not implemented.                                           | Out of scope for a native provider; these are for companies already locked into WorkOS/Kinde. |
| **Encrypted third-party secrets vault**                    | convex-api-tokens                                    | Not implemented.                                           | Different product surface; not auth.                                                          |
| **API key usage tracking / rate limiting / usage credits** | several API key components                           | Basic API keys; usage/rate limiting minimal.               | Improve `authApiKeys` to include usage counters and per-key rate limits.                      |
| **Generic invite links with social preview**               | convex-invite-links                                  | Org invitations exist.                                     | Could extend invites to shareable URLs and social metadata.                                   |

## 5. Positioning thesis

If you are building on Convex, auth should live in Convex. Every external service or fragmented component stack adds:

- Another network boundary.
- Another dependency with its own uptime and data model.
- Another place where your user data is not reactive with the rest of your app.

`@vortex-api/convex-auth` is the only Convex-native package that gives users, sessions, email/password, OAuth, 2FA, magic links, email OTP, organizations, roles, invitations, API keys, webhooks, MCP OAuth, and agent auth in one integrated system, with a one-time migration off Better Auth.

The other components are good at narrow jobs. Use them only when you hit a specific gap — passkeys, full Zanzibar, general OIDC provider, WorkOS/Kinde sync, or third-party secrets vaulting. For the standard auth surface, `@vortex-api/convex-auth` is the native, integrated choice.
