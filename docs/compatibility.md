# Compatibility

This page lists the runtime and dependency versions `convex-better-auth-2.0` is tested against.

> **Disclaimer:** This is an independent, community-driven project. It is not affiliated with or endorsed by Convex Inc.

## Current matrix

| Package                      | Version  | Better Auth      | Convex                      | React                  | React Native / Expo | Node        | pnpm      |
| ---------------------------- | -------- | ---------------- | --------------------------- | ---------------------- | ------------------- | ----------- | --------- |
| `convex-better-auth-adapter` | `0.13.4` | `>=1.7.1 <1.8.0` | `>=1.39.0` (`^1.25.0` peer) | `^18.3.1 \|\| ^19.0.0` | —                   | `>=20.12.0` | `10.25.0` |
| `convex-better-auth`         | `2.0.5`  | `>=1.7.1 <1.8.0` | `>=1.39.0`                  | —                      | —                   | `>=20.12.0` | `10.25.0` |
| `convex-auth`                | `1.7.5`  | —                | `>=1.39.0`                  | `>=19.0.0`             | —                   | `>=20.12.0` | `10.25.0` |
| `convex-auth-react`          | `1.4.1`  | —                | `>=1.39.0`                  | `>=19.0.0`             | —                   | `>=20.12.0` | `10.25.0` |
| `convex-auth-react-native`   | `1.1.2`  | —                | `>=1.39.0`                  | `>=19.0.0`             | `expo-* (optional)` | `>=20.12.0` | `10.25.0` |
| `convex-auth-core`           | `0.1.0`  | —                | `>=1.39.0`                  | —                      | —                   | `>=20.12.0` | `10.25.0` |
| `convex-auth-ui`             | `0.1.0`  | —                | `>=1.39.0`                  | `>=19.0.0`             | —                   | `>=20.12.0` | `10.25.0` |

## What the ranges mean

- **Better Auth** — only `convex-better-auth` and `convex-better-auth-adapter` still carry the Better Auth 1.7.x peer dependency. `convex-auth`, `convex-auth-react`, and `convex-auth-react-native` are now Better Auth-free.
- **Convex** — `>=1.39.0` covers the modern backend system and generated component API. The adapter itself accepts `>=1.25.0`, but the other packages currently require `>=1.39.0`.
- **React** — the React packages require React 19. The adapter also accepts React 18 for consumers who use it outside the React packages.
- **Node** — CI runs on Node 20.12+ and Node 22. Older Node versions are not tested.
- **pnpm** — the workspace uses pnpm only. The `pnpm-workspace.yaml` overrides a few Vitest-related packages for consistency.

## Updating Better Auth or Convex

The adapter tests in `packages/better-auth-adapter` are the conformance suite for any Better Auth or Convex bump. If you want to widen a range:

1. Bump the version in `packages/better-auth-adapter/package.json` first.
2. Run `pnpm run typecheck`, `pnpm run build`, and `pnpm test` from the repo root.
3. Run the adapter tests specifically with `pnpm --filter convex-better-auth-adapter test`.

Do not widen a peer range without running the full adapter test suite — the adapter is where the type-level contract between Better Auth and Convex is enforced.
