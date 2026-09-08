---
title: Testing
description: "Test helpers for the convex-auth native runtime."
---

# Testing

`convex-auth/testing` provides helpers for driving the native auth flow in Convex unit tests.

## Install

```bash
pnpm add -D convex-auth
```

## Unit tests with `convex-test`

For backend unit tests, use `convex-test` with the generated `api` and the mounted `convex-auth` schema:

```ts
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./convex/_generated/api";
import schema from "./convex/schema";

const t = convexTest(schema);

describe("auth", () => {
  it("signs up", async () => {
    await t.action(api.auth.signUp, {
      name: "Test User",
      email: "test@example.com",
      password: "S3cur3P@ss!0001",
    });
  });
});
```

## E2E tests with `convex-auth/testing`

`convex-auth/testing` is for end-to-end browser tests. It exposes environment and credential helpers, not a unit-test harness.

## Conformance consumer

The internal `packages/conformance-consumer` is the source of truth for native-runtime conformance. It is not published, but its `convex/auth.ts` and generated `_generated` files are the reference configuration when writing your own tests.
