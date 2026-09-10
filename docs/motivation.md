# Why `convex-auth` exists

This workspace is a full-stack, open-source auth solution for [Convex](https://convex.dev). It gives Convex developers an out-of-the-box auth layer that covers the same surface area as Clerk or WorkOS, while keeping auth state in the same database as the rest of the app.

## The two problems it addresses

### 1. Convex Auth 2.0 is still coming

Convex has made it clear that a richer built-in auth system is on the roadmap. Until it ships, Convex apps need a way to run production-grade auth today without betting against Convex's eventual first-class solution. Better Auth has the most complete feature set available, but it is not designed around Convex's component and query model out of the box.

### 2. Auth state should live in Convex

Clerk and WorkOS are great products, but they are **external auth platforms** that own your users, sessions, and organization data. That creates two problems for a Convex app:

1. **Data gravity.** Auth state lives outside Convex, so every auth check is a network call, every organization lookup is a network call, and every audit log is a sync problem.
2. **Lock-in.** The longer you stay on a hosted auth platform, the deeper your schema and UI depend on its shapes and its availability.

This project gives you the Clerk/WorkOS feature surface — users, orgs, invites, roles, API keys, OAuth, 2FA, webhooks, machine auth — while keeping the source of truth in **your Convex database**. You own the domain. The auth provider is a component inside your backend, not a separate service.

## What this repo does about it

`convex-auth` is now a single public package, `convex-auth`, with a one-time Better Auth migration bridge. Everything ships as subpaths of `convex-auth`:

| Subpath                    | What it is today                          |
| -------------------------- | ----------------------------------------- |
| `convex-auth`              | Convex-native auth runtime and component. |
| `convex-auth/react`        | React UI and hooks.                       |
| `convex-auth/react-native` | Expo / React Native client.               |
| `convex-auth/mcp`          | MCP OAuth helpers.                        |
| `convex-auth/preflight`    | Deployment readiness checks.              |
| `convex-auth/testing`      | Test helpers.                             |

Better Auth is no longer a runtime dependency for new projects. New projects use `convex-auth` directly. The migration helper at `packages/auth/scripts/migrate-better-auth.ts` exists only to help existing Better Auth consumers move their data, then remove.

## Relationship to Convex Auth 2.0

This repo is not a copy of Convex Auth 2.0. It is an independent implementation that learns from Convex Auth 2.0's design constraints and ships its own B2B surface. When Convex Auth 2.0 is ready, migration should be straightforward because the data already lives in your Convex database and the table layout is intentionally close.
