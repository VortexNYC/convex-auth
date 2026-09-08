---
title: "ADR-002: One-time Better Auth migration instead of a runtime bridge"
description: "Decision record for a one-time Better Auth migration path."
---

# ADR-002: One-time Better Auth migration instead of a runtime bridge

## Status

Accepted

## Date

2026-09-03

## Context

`convex-better-auth` and `convex-better-auth-adapter` originally acted as a runtime bridge: Better Auth primitives ran inside the Convex isolate and translated state into Convex tables on every request. This kept Better Auth in the bundle and forced consumers to keep the `better-auth` runtime installed while they were supposedly migrating.

The goal is to get consumers completely off Better Auth. A runtime bridge cannot do that because it keeps the dependency alive. A migration, by contrast, copies the data once and then the bridge is uninstalled.

## Decisions

### 1. The bridge becomes a one-time migration

**Decision:** `convex-better-auth` and `convex-better-auth-adapter` are used only for one-time data and client migration. Consumers run the migration once, verify the data, then remove the packages.

- The migration is implemented in `convex-better-auth-adapter` and exposed through the `convex-auth` CLI.
- After the migration, `convex-auth` is the only auth runtime.
- `convex-better-auth` and `convex-better-auth-adapter` will be deprecated once the migration tool is stable.

### 2. The migration runs inside Convex

**Decision:** The migration is implemented as Convex actions that read the legacy Better Auth adapter tables and write to the native `convex-auth` tables.

- All table translation happens in one project deployment.
- Consumers trigger it via `pnpm dlx convex-auth migrate better-auth`.
- No external ETL pipeline or manual row-by-row export is required.

### 3. Migration is opt-in and idempotent

**Decision:** The migration tool:

- Does not delete legacy rows until the consumer explicitly confirms.
- Can be run multiple times without duplicating native rows.
- Writes to separate `convex-auth` tables so consumers can compare before switching.

## Consequences

- `convex-auth` does not import or depend on the Better Auth runtime.
- The `convex-better-auth` and `convex-better-auth-adapter` packages are migration-only.
- Migration guides are simplified to: install the migration tool, run it once, remove the old package.

## Related

- `docs/convex-native-auth-strategy.md`
- `docs/migrating-from-better-auth.md`
- `docs/better-auth-to-convex.md`
