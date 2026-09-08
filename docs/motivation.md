# Why `convex-better-auth-2.0` exists

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

`convex-better-auth-2.0` is now a Convex-native auth platform with a one-time Better Auth migration bridge:

| Package                      | What it is today                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `convex-auth`                | Convex-native auth runtime and component. This is what most apps install.        |
| `convex-auth-react`          | React UI and hooks for the native runtime.                                       |
| `convex-auth-react-native`   | Expo / React Native client for the native runtime.                               |
| `convex-auth-core`           | Auth domain core (permissions, roles, scopes).                                   |
| `convex-auth-ui`             | Base shadcn-style UI primitives.                                                 |
| `convex-better-auth-adapter` | One-time migration bridge from an existing Better Auth database.                 |
| `convex-better-auth`         | One-time migration helper for the Better Auth client/runtime during the cutover. |

Better Auth is no longer a runtime dependency for new projects. New projects use `convex-auth` directly. The `convex-better-auth-*` packages exist only to help existing Better Auth consumers migrate their data and then uninstall.

## Relationship to Convex Auth 2.0

This repo is not a copy of Convex Auth 2.0. It is an independent implementation that learns from Convex Auth 2.0's design constraints and ships its own B2B surface. When Convex Auth 2.0 is ready, migration should be straightforward because the data already lives in your Convex database and the table layout is intentionally close.

