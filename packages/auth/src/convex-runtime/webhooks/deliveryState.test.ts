import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  buildConvexWebhookDeliveryResultUpdate,
  buildConvexWebhookStaleDeliveryUpdate,
} from "./deliveryState";

describe("webhook delivery state updates", () => {
  it("builds retry state from a pending delivery outcome", () => {
    const now = 1_700_000_000_000;
    const update = buildConvexWebhookDeliveryResultUpdate({
      delivery: {
        attemptCount: 0,
        processingScheduledAt: now,
      },
      deliveryKey: "endpoint:event:delivery",
      now,
      outcome: {
        status: "pending",
        responseStatus: 503,
        responseBody: "down",
        failureKind: "server_error",
      },
      retryOptions: {
        initialBackoffMs: 1_000,
        jitterWindowRatio: 0,
        maxBackoffMs: 10_000,
      },
    });

    assert.deepEqual(update, {
      status: "pending",
      attemptCount: 1,
      nextAttemptAt: now + 1_000,
      processingScheduledAt: now,
      responseStatus: 503,
      responseBody: "down",
      failureKind: "server_error",
      deliveredAt: null,
      exhaustedAt: null,
      updatedAt: now,
    });
  });

  it("clears retry scheduling and records delivery time on success", () => {
    const now = 1_700_000_000_000;
    const update = buildConvexWebhookDeliveryResultUpdate({
      delivery: {
        attemptCount: 1,
        processingScheduledAt: now - 1,
      },
      deliveryKey: "endpoint:event:delivery",
      now,
      outcome: {
        status: "delivered",
        responseStatus: 204,
        responseBody: "",
      },
    });

    assert.deepEqual(update, {
      status: "delivered",
      attemptCount: 2,
      nextAttemptAt: null,
      processingScheduledAt: null,
      responseStatus: 204,
      responseBody: "",
      failureKind: null,
      deliveredAt: now,
      exhaustedAt: null,
      updatedAt: now,
    });
  });

  it("preserves prior delivery time when a forced retry later fails", () => {
    const now = 1_700_000_000_000;
    const deliveredAt = now - 60_000;
    const update = buildConvexWebhookDeliveryResultUpdate({
      delivery: {
        attemptCount: 3,
        deliveredAt,
      },
      deliveryKey: "endpoint:event:delivery",
      now,
      outcome: {
        status: "failed",
        responseStatus: 400,
        responseBody: "bad request",
        failureKind: "client_error",
      },
    });

    assert.deepEqual(update, {
      status: "failed",
      attemptCount: 4,
      nextAttemptAt: null,
      processingScheduledAt: null,
      responseStatus: 400,
      responseBody: "bad request",
      failureKind: "client_error",
      deliveredAt,
      exhaustedAt: now,
      updatedAt: now,
    });
  });

  it("builds stale processing recovery state", () => {
    const now = 1_700_000_000_000;

    assert.deepEqual(
      buildConvexWebhookStaleDeliveryUpdate({
        delivery: { recoveryCount: 2 },
        now,
      }),
      {
        status: "pending",
        nextAttemptAt: now,
        updatedAt: now,
        recoveredAt: now,
        recoveryCount: 3,
        responseBody: "Recovered stale processing delivery for retry",
        failureKind: null,
        responseStatus: null,
        deliveredAt: null,
        exhaustedAt: null,
      },
    );
  });
});
