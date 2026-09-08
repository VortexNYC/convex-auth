import assert from "node:assert/strict";

import type { AuthRuntimeStatus } from "../core";
import { describe, it } from "vitest";

import {
  canRunProtectedWrite,
  getProtectedWriteNotReadyMessage,
  guardProtectedWrite,
  ProtectedWriteNotReadyError,
} from "./protected-writes";

describe("protected writes", () => {
  it("allows protected writes only when convex auth is ready", async () => {
    const runner = guardProtectedWrite(
      async (args: { value: string }) => args.value,
      createStatus({
        state: "convexReady",
        providerAuthenticated: true,
        tokenAvailable: true,
        convexAuthenticated: true,
      }),
    );

    assert.equal(await runner({ value: "ok" }), "ok");
  });

  it("blocks protected writes in all non-ready auth runtime states", async () => {
    const blockedStates: Array<AuthRuntimeStatus["state"]> = [
      "signedOut",
      "providerLoading",
      "providerReady",
      "tokenRefreshing",
      "tokenReady",
      "convexConnecting",
      "degraded",
      "reauthRequired",
    ];

    await Promise.all(
      blockedStates.map(async (state) => {
        const status = createStatus({ state });
        assert.equal(canRunProtectedWrite(status), false);
        const runner = guardProtectedWrite(async () => "nope", status);
        await assert.rejects(runner({}), (error: unknown) => {
          assert.ok(error instanceof ProtectedWriteNotReadyError);
          assert.equal(error.runtimeState, state);
          assert.equal(error.message, getProtectedWriteNotReadyMessage(status));
          return true;
        });
      }),
    );
  });
});

function createStatus(overrides: Partial<AuthRuntimeStatus>): AuthRuntimeStatus {
  return {
    state: "signedOut",
    providerAuthenticated: false,
    tokenAvailable: false,
    convexAuthenticated: false,
    isRecovering: false,
    reauthRequired: false,
    ...overrides,
  };
}
