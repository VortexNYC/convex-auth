import assert from "node:assert/strict";

import { describe, it } from "vitest";

import type { AuthRuntimeStatus } from "./auth-readiness";

describe("auth-readiness states", () => {
  it("convexReady is convexAuthenticated", () => {
    const s: AuthRuntimeStatus = {
      state: "convexReady",
      providerAuthenticated: true,
      tokenAvailable: true,
      convexAuthenticated: true,
      isRecovering: false,
      reauthRequired: false,
    };
    assert.equal(s.state, "convexReady");
    assert.equal(s.convexAuthenticated, true);
  });

  it("signedOut has all flags false", () => {
    const s: AuthRuntimeStatus = {
      state: "signedOut",
      providerAuthenticated: false,
      tokenAvailable: false,
      convexAuthenticated: false,
      isRecovering: false,
      reauthRequired: false,
    };
    assert.equal(s.providerAuthenticated, false);
    assert.equal(s.tokenAvailable, false);
  });
});
