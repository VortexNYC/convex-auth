# Compatibility

This page lists the runtime and dependency versions `convex-auth` is tested against.

> **Disclaimer:** This is an independent, community-driven project. It is not affiliated with or endorsed by Convex Inc.

## Current matrix

| Package / subpath          | Version | Convex     | React      | React Native / Expo | Node        | pnpm      |
| -------------------------- | ------- | ---------- | ---------- | ------------------- | ----------- | --------- |
| `convex-auth`              | `2.0.1` | `>=1.45.0` | `>=19.0.0` | —                   | `>=20.12.0` | `10.25.0` |
| `convex-auth/react`        | `2.0.1` | `>=1.45.0` | `>=19.0.0` | —                   | `>=20.12.0` | `10.25.0` |
| `convex-auth/react-native` | `2.0.1` | `>=1.45.0` | `>=19.0.0` | `expo-*` (optional) | `>=20.12.0` | `10.25.0` |

Better Auth is not a runtime dependency for `convex-auth`. The migration helper at `packages/auth/scripts/migrate-better-auth.ts` can bridge an existing Better Auth 1.7.x database, but it is removed after the data cutover.

## What the ranges mean

- **Convex** — `>=1.45.0` covers the modern backend system and generated component API.
- **React** — React 19 is the primary target; the client side does not depend on a specific React 18 release.
- **Node** — CI runs on Node 20.12+ and Node 22. Older Node versions are not tested.
- **pnpm** — the workspace uses pnpm only. The `pnpm-workspace.yaml` overrides a few Vitest-related packages for consistency.

## Updating Convex

If you want to widen the `convex` peer range:

1. Update the range in `packages/auth/package.json`.
2. Run `pnpm run typecheck`, `pnpm run build`, and `pnpm test` from the repo root.
3. Do not widen a peer range without running the full test suite.
