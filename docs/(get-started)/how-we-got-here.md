---
title: How we got here
description: Why convex-auth exists and the path that led to the current architecture.
---

`convex-auth` is a full-stack, open-source auth solution for [Convex](https://convex.dev). It gives Convex developers an out-of-the-box auth layer that covers the same surface area as Clerk or WorkOS, while keeping auth state in the same database as the rest of the app.

## Why this exists

### 1. Convex needed a production auth layer now

Convex has a richer built-in auth system on the roadmap, but apps need production-grade auth today. Existing auth frameworks were built for long-lived Node or Edge runtimes, not for Convex's stateless V8 isolates, deterministic queries, and component model.

### 2. Auth state should live in Convex

Hosted auth platforms own your users, sessions, and organization data. That creates two problems for a Convex app:

1. **Data gravity.** Auth state lives outside Convex, so every auth check and organization lookup is a network call, and audit logs become a sync problem.
2. **Lock-in.** The longer you stay on a hosted platform, the deeper your schema and UI depend on its shapes and availability.

`convex-auth` keeps users, sessions, identities, organizations, API keys, webhooks, and MCP auth in **your Convex database**. You own the domain. The auth provider is a component inside your backend, not a separate service.

## What this repo does about it

`convex-auth` ships as a single public package with subpaths for the runtime, React client, React Native client, MCP helpers, preflight checks, and test utilities:

| Subpath                    | What it is today                          |
| -------------------------- | ----------------------------------------- |
| `convex-auth`              | Convex-native auth runtime and component. |
| `convex-auth/react`        | React UI and hooks.                       |
| `convex-auth/react-native` | Expo / React Native client.               |
| `convex-auth/mcp`          | MCP OAuth helpers.                        |
| `convex-auth/preflight`    | Deployment readiness checks.              |
| `convex-auth/testing`      | Test helpers.                             |

For new projects there is no external auth runtime dependency. A one-time migration bridge exists only for consumers moving from another auth setup.

## The first rail: another auth runtime

When we started, Convex did not have a first-party auth product that covered the full Clerk/WorkOS surface. An existing open-source auth framework covered the feature set we needed, so we built `convex-auth` as an integration that wired that framework into Convex's database and component model.

### What worked

- It gave us battle-tested password hashing, session issuance, OAuth, 2FA, and email flows on day one.
- It showed that a full auth framework could run inside the Convex isolate.
- We could ship a working auth stack for Convex apps before a native solution existed.

### What broke down

The framework was designed for a long-lived Node.js/Edge runtime. Convex functions are stateless V8 isolates. The mismatch showed up quickly:

- **Bundle size.** Barrel imports and plugin instantiation pushed the `convex/` bundle toward the 32 MiB source-code limit. Consumers had to use subpath imports and lazy route registration to stay under it.
- **Memory.** Plugin state and crypto in memory did not fit Convex's 64 MB heap.
- **Determinism.** Middleware and session machines assumed a request/response lifecycle. Convex queries and mutations must be deterministic and fast.
- **Lock-in.** The framework wanted to own the tables for organizations, members, invitations, API keys, and webhooks. If those became the source of truth, we would inherit another framework's data model and future migrations would be painful.
- **Performance.** Slow queries on empty tables, missing session indexes, and async JWT claim handling did not fit the Convex query model.

The conclusion was clear: the framework was a great starting point, but its plugin model and runtime assumptions could not be the long-term foundation for a Convex-native auth platform. We needed to keep the auth **state** in Convex tables and rebuild the B2B control plane as Convex components.

## Convex Auth 2.0 showed the way

Convex Auth 2.0 was announced with a clear architectural direction:

- Auth runs in the same database and runtime as the app.
- Auth state is just Convex state: users, sessions, and identities are tables.
- Non-deterministic work (password hashing, network calls, token generation) belongs in actions.
- Crypto uses Web Crypto, not Node crypto.
- Providers are metadata, not a runtime framework.
- The public API is a single `convexAuth({ providers })` helper that returns typed action refs.

This validated that the native path was viable and gave us the design vocabulary for the next phase: moving authentication itself into Convex, not just the B2B control plane.

## Where we are now

- `convex-auth` is the native Convex auth runtime. New projects start here.
- The migration bridge exists only as a one-time data copy for existing consumers of another auth setup.
- The bridge copies users, accounts, and sessions once, then the consumer removes it.
- The B2B control plane (orgs, members, invitations, permissions, API keys, webhooks, MCP, agent auth) is already Convex-native.

`convex-auth` is an independent implementation. It learns from Convex Auth 2.0's design constraints but ships its own B2B surface. It does not copy Convex Auth 2.0 and does not depend on it. The table layout and public API are intentionally close so migration is straightforward when Convex Auth 2.0 is ready.
