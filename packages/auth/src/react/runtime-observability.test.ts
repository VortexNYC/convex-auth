import assert from "node:assert/strict";

import type { AuthRuntimeStatus } from "../core";
import { describe, it } from "vitest";

import {
  getAuthRuntimeTransitionEvent,
  getAuthTokenRefreshFailureEvent,
} from "./runtime-observability";

describe("runtime observability", () => {
  it("emits no transition event on first observed status", () => {
    const nextStatus = createStatus({ state: "providerLoading" });

    assert.equal(getAuthRuntimeTransitionEvent(null, nextStatus), null);
  });

  it("emits no transition event when state is unchanged", () => {
    const status = createStatus({
      state: "convexReady",
      providerAuthenticated: true,
      tokenAvailable: true,
      convexAuthenticated: true,
    });

    assert.equal(getAuthRuntimeTransitionEvent(status, status), null);
  });

  it("emits redacted runtime transition events when state changes", () => {
    const transition = getAuthRuntimeTransitionEvent(
      createStatus({
        state: "tokenRefreshing",
        providerAuthenticated: true,
        isRecovering: true,
      }),
      createStatus({
        state: "convexReady",
        providerAuthenticated: true,
        tokenAvailable: true,
        convexAuthenticated: true,
      }),
    );

    assert.deepEqual(transition, {
      eventName: "auth_runtime_state_changed",
      properties: {
        surface: "runtime",
        fromState: "tokenRefreshing",
        toState: "convexReady",
        providerAuthenticated: true,
        tokenAvailable: true,
        convexAuthenticated: true,
        isRecovering: false,
        reauthRequired: false,
      },
    });
  });

  it("emits redacted token refresh failure events", () => {
    const event = getAuthTokenRefreshFailureEvent({
      error: new Error("network failed"),
      forceRefreshToken: true,
      hadCachedToken: true,
      hadFallbackToken: false,
    });

    assert.deepEqual(event, {
      eventName: "auth_token_refresh_failed",
      properties: {
        surface: "runtime",
        forceRefreshToken: true,
        hadCachedToken: true,
        hadFallbackToken: false,
        message: "network failed",
      },
    });
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
