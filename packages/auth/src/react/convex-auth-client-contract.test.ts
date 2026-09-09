import assert from "node:assert/strict";

import { describe, it } from "vitest";

import type { useConvexAuthClient } from "./convex-auth-client";
import type { ConvexBetterAuthClient } from "./auth-client-types";

type NativeClient = ReturnType<typeof useConvexAuthClient>;

const clientAssignableToConvex: (client: NativeClient) => ConvexBetterAuthClient = (client) =>
  client;

describe("Convex native client contract", () => {
  it("useConvexAuthClient return type is assignable to ConvexBetterAuthClient", () => {
    assert.equal(typeof clientAssignableToConvex, "function");
  });
});
