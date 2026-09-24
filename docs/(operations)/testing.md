# Testing

`@vortex-api/convex-auth/testing` provides helpers for driving the native auth flow in Convex unit tests.

## Install

```bash
pnpm add -D convex-auth
```

## Exports

The `@vortex-api/convex-auth/testing` entry exposes test fixtures and factory functions. These are designed to be used from Convex's `convex-test` harness or from a Node test runner that sets up a `ConvexHttpClient`.

## Example: email/password sign-up in a test

```ts
import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api";

const client = new ConvexHttpClient(process.env.CONVEX_URL!);

async function signUpUser(email: string) {
  return await client.action(api.auth.signUp, {
    name: "Test User",
    email,
    password: "S3cur3P@ss!0001",
  });
}
```

## Registering the component in `convex-test`

`@vortex-api/convex-auth/test` (note: `/test`, not `/testing`) exports the pieces `convex-test` needs to mount the component inside your own harness:

```ts
import { register } from "@vortex-api/convex-auth/test";
import { convexTest } from "convex-test";
import { components } from "./convex/_generated/api";

const t = convexTest(schema, modules);
register(t); // t.registerComponent("convexAuth", schema, modules)

await t.query(components.convexAuth.status.get);
```

Also exported: `convexAuthTest` (default), `modules` (the component's `import.meta.glob` map), and `schema`.

The component installs children (`rateLimiter`, `mcpOauth` as `mcp`) via `component.use`. They are not registered by `register` — any code path that calls `components.rateLimiter` or `components.mcp` needs those components registered through their own package test entries.

## Conformance consumer

The internal `packages/conformance-consumer` is the source of truth for native-runtime conformance. It is not published, but its `convex/auth.ts` and generated `_generated` files are the reference configuration when writing your own tests.
