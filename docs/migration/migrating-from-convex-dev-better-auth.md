---
title: Migrating from `@convex-dev/better-auth`
description: "Move from the Convex-dev adapter to this workspace."
---

# Migrating from `@convex-dev/better-auth`

If you were using `@convex-dev/better-auth`, the move to this workspace is mostly a package-name change. The runtime semantics are the same; the adapter was vendored to keep it on the Better Auth 1.7 line and in the same repo as the higher-level Convex primitives.

## 1. Install the new package

```bash
pnpm remove @convex-dev/better-auth
pnpm add convex-better-auth-adapter
```

## 2. Update imports

Replace any imports from `@convex-dev/better-auth` with the same path under `convex-better-auth-adapter`:

```ts
// Before
import { convexClient } from "@convex-dev/better-auth/client/plugins";

// After
import { convexClient } from "convex-better-auth-adapter/client/plugins";
```

React / React Native provider imports also move:

```tsx
// Before
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";

// After
import { ConvexBetterAuthProvider } from "convex-better-auth-adapter/react";
```

## 3. Bump Better Auth to 1.7.x

Update your `package.json` to require `better-auth` in the `>=1.7.1 <1.8.0` range:

```json
{
  "dependencies": {
    "better-auth": "^1.7.2"
  }
}
```

The adapter is not compatible with Better Auth 1.6.x or earlier.

## 4. Account issuer migration

Better Auth 1.7 changed how the `account` table stores the provider issuer. The adapter includes a backfill path for existing data, but you should read the migration notes in the upstream PR that landed this work:

- [`get-convex/better-auth#430`](https://github.com/get-convex/better-auth/pull/430)

If you are starting a new project, no migration is needed — the 1.7 schema is used from the beginning.

## 5. React Native / Expo storage

If you use the Expo client, `convex-auth-react-native` now wires the `expoClient` storage with both sync and async `SecureStore` methods. You should still pass a `SecureStore`-compatible object as `storage`, but the package no longer needs a custom sync-only wrapper.

## 6. Update your `convex` version

The rest of the workspace currently requires `convex >=1.39.0`. Make sure your app is on at least that version.

## 7. Run the full local proof

After the rename and bump, run:

```bash
pnpm install
pnpm run typecheck
pnpm run build
pnpm run test
```

If you were previously on Better Auth 1.6, read the [Better Auth 1.7 release notes](https://www.better-auth.com/changelog) first — there may be auth-options or plugin changes outside the adapter.
