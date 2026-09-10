---
title: Architecture
description: How convex-auth is designed around Convex's runtime constraints.
---

`convex-auth` is a native Convex auth runtime. Users, sessions, identities, and the B2B control plane live in your Convex database and run inside the default Convex isolate.

## Why a native Convex runtime

Convex functions run in short-lived V8 isolates, not long-lived Node processes. Auth must fit that model:

- **Auth state is Convex state.** Queries, mutations, and authorization rules read users, sessions, organizations, and roles directly from tables.
- **Non-deterministic work is an action.** Password hashing, network calls, token generation, and OAuth callbacks run in Convex actions.
- **Crypto is Web Crypto.** `crypto.subtle` and `jose` handle hashing, JWT minting, JWKS rotation, and randomness. No Node crypto modules are used at runtime.
- **Bundle and heap discipline.** The runtime stays under Convex's source-code and heap limits by avoiding monolithic plugin systems and stateful middleware.

## Runtime layers

| Layer            | Responsibility                                                                  | Examples                                                  |
| ---------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Component**    | Tables, indexes, and component exports for auth, orgs, API keys, webhooks, etc. | `convexAuth`, `convexAuthCore`, `convexAuthOrganizations` |
| **Actions**      | Non-deterministic or side-effecting work.                                       | `signIn`, `signUp`, `signInOAuth`, `resetPassword`        |
| **Queries**      | Read auth state for client checks.                                              | `session`, `user`, `organizationMembers`                  |
| **HTTP actions** | OAuth callback, webhook delivery, MCP endpoints.                                | `/auth/callback/:provider`, `/auth/webhooks/:endpoint`    |
| **React client** | Provider and hooks that call the actions.                                       | `ConvexAuthClientProvider`, `useAuthActions`              |

## Auth flow

1. The client collects credentials (email/password, OAuth redirect, magic link token, TOTP).
2. It calls an action on the `auth` namespace exported from `convex/auth.ts`.
3. The action validates the credential, writes the session to `authSessions`, and returns a JWT.
4. The client stores the JWT and sends it on subsequent Convex requests.
5. Queries and mutations read `authSessions` and `auth_identities` directly; no external auth service is consulted.

## Component model

The package ships the full `convexAuth` component for backward compatibility and a set of smaller, feature-gated components for new projects:

- `convex-auth/convex.config/core` — users, identities, sessions, accounts, verifiers, rate limits.
- `convex-auth/convex.config/organizations` — core + organizations, roles, members, invitations.
- `convex-auth/convex.config/apiKeys` — users, organizations, service principals, API keys, audit events.
- `convex-auth/convex.config/webhooks` — webhook endpoints and deliveries.
- `convex-auth/convex.config/agentAuth` — agent auth tables.
- `convex-auth/convex.config/mcpOauth` — MCP OAuth clients and tokens.

Each add-on includes its prerequisite tables. A consumer mounts only what they use.

## Security model

- Tokens are signed with `JWT_PRIVATE_KEY` and published through a JWKS endpoint.
- Refresh tokens are rotated on every use and stored in `authSessions`.
- Rate limits and CAPTCHA hooks are action-level concerns.
- API keys and service principals are first-class identities with scoped permissions.

## Migration from existing auth

If you are migrating from another auth system, `convex-auth` provides a one-time data migration bridge. See [Migrating from Better Auth](./migrating-from-better-auth) for the Better Auth cutover guide.
