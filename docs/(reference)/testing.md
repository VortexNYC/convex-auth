# Testing

`convex-auth/testing` provides helpers for driving the native auth flow in Convex unit tests.

## Install

```bash
pnpm add -D convex-auth
```

## Exports

The `convex-auth/testing` entry exposes test fixtures and factory functions. These are designed to be used from Convex's `convex-test` harness or from a Node test runner that sets up a `ConvexHttpClient`.

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

## Conformance consumer

The internal `packages/conformance-consumer` is the source of truth for native-runtime conformance. It is not published, but its `convex/auth.ts` and generated `_generated` files are the reference configuration when writing your own tests.
