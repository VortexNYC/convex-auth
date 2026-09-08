# `convex-better-auth-adapter`

A [Better Auth](https://www.better-auth.com) database adapter for [Convex](https://www.convex.dev), maintained as part of [`convex-better-auth-2.0`](https://github.com/shlomokabareti/convex-better-auth-2.0).

This package is a community-owned continuation of the adapter originally developed in [`get-convex/better-auth`](https://github.com/get-convex/better-auth), including the Better Auth 1.7 migration from [`get-convex/better-auth#430`](https://github.com/get-convex/better-auth/pull/430). It is vendored here so the Convex + Better Auth bridge can keep pace with Better Auth releases while Convex Auth 2.0 matures.

Most new apps should use [`convex-auth`](../packages/auth) directly. This adapter is the low-level migration bridge for existing Better Auth code.

## Install

```bash
pnpm add convex-better-auth-adapter
```

## Peer dependencies

```json
{
  "better-auth": ">=1.7.1 <1.8.0",
  "convex": ">=1.39.0",
  "react": "^18.3.1 || ^19.0.0"
}
```

## Quick start

In your Convex backend:

```ts
import { convexClient } from "convex-better-auth-adapter/client/plugins";
```

Most consumers should use the higher-level packages instead:

- [`convex-auth`](https://npmjs.com/package/convex-auth) — the Convex auth component and control plane.
- [`convex-better-auth`](https://npmjs.com/package/convex-better-auth) — the Better Auth ↔ Convex runtime bridge.
- [`convex-auth-react`](https://npmjs.com/package/convex-auth-react) — React UI and hooks.
- [`convex-auth-react-native`](https://npmjs.com/package/convex-auth-react-native) — Expo / React Native client.

See the [full docs](https://convex-auth.vortex.nyc) for the design rationale and migration guide.

## Attribution

The source in this package started from `get-convex/better-auth` and includes the Better Auth 1.7 migration. All original code remains under the Apache-2.0 license.

## License

Apache-2.0
