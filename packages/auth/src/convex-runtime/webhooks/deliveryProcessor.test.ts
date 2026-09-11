import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  processConvexWebhookDelivery,
  type ConvexWebhookFetch,
  type ConvexWebhookProcessorDelivery,
  type ConvexWebhookProcessorEndpoint,
} from "./deliveryProcessor";

const throwingFetch: ConvexWebhookFetch = async () => {
  throw new Error("connection reset");
};
import { signConvexWebhookPayload } from "./signing";

const NOW = 1_700_000_000_000;

function endpoint(
  overrides: Partial<ConvexWebhookProcessorEndpoint> = {},
): ConvexWebhookProcessorEndpoint {
  return {
    _id: "endpoint_1",
    url: "https://example.test/hook",
    secret: "cvxsec_test_secret",
    status: "active",
    ...overrides,
  };
}

function delivery(
  overrides: Partial<ConvexWebhookProcessorDelivery> = {},
): ConvexWebhookProcessorDelivery {
  return {
    _id: "delivery_1",
    endpointId: "endpoint_1",
    eventId: "evt_1",
    eventType: "user.created",
    payloadJson: '{"id":"evt_1"}',
    attemptCount: 0,
    ...overrides,
  };
}

function fetchReturning(status: number, body = ""): ConvexWebhookFetch {
  return async () => ({ status, text: async () => body });
}

describe("processConvexWebhookDelivery", () => {
  it("marks a 2xx response as delivered and signs the payload", async () => {
    let capturedHeaders: Record<string, string> | undefined;
    let capturedBody: string | undefined;
    const fetchFn: ConvexWebhookFetch = async (_url, init) => {
      capturedHeaders = init.headers;
      capturedBody = init.body;
      return { status: 200, text: async () => "ok" };
    };

    const result = await processConvexWebhookDelivery({
      endpoint: endpoint(),
      delivery: delivery(),
      fetch: fetchFn,
      now: NOW,
    });

    assert.equal(result.outcome.status, "delivered");
    assert.equal(result.update.status, "delivered");
    assert.equal(result.update.attemptCount, 1);
    assert.equal(result.update.deliveredAt, NOW);
    assert.equal(result.update.nextAttemptAt, null);

    assert.equal(capturedBody, '{"id":"evt_1"}');
    const expectedSignature = await signConvexWebhookPayload(
      "cvxsec_test_secret",
      '{"id":"evt_1"}',
    );
    assert.equal(capturedHeaders?.["x-convex-signature"], expectedSignature);
    assert.equal(capturedHeaders?.["x-convex-event"], "user.created");
  });

  it("reschedules a retryable 5xx failure as pending", async () => {
    const result = await processConvexWebhookDelivery({
      endpoint: endpoint(),
      delivery: delivery({ attemptCount: 0 }),
      fetch: fetchReturning(503, "down"),
      now: NOW,
      maxAttempts: 4,
    });

    assert.equal(result.update.status, "pending");
    assert.equal(result.update.failureKind, "server_error");
    assert.ok(result.update.nextAttemptAt !== null && result.update.nextAttemptAt > NOW);
    assert.equal(result.update.exhaustedAt, null);
  });

  it("marks a 4xx client error as terminally failed without retry", async () => {
    const result = await processConvexWebhookDelivery({
      endpoint: endpoint(),
      delivery: delivery(),
      fetch: fetchReturning(400, "bad request"),
      now: NOW,
    });

    assert.equal(result.update.status, "failed");
    assert.equal(result.update.failureKind, "client_error");
    assert.equal(result.update.exhaustedAt, NOW);
    assert.equal(result.update.nextAttemptAt, null);
  });

  it("exhausts a retryable failure once max attempts is reached", async () => {
    const result = await processConvexWebhookDelivery({
      endpoint: endpoint(),
      delivery: delivery({ attemptCount: 3 }),
      fetch: fetchReturning(503, "down"),
      now: NOW,
      maxAttempts: 4,
    });

    assert.equal(result.update.status, "failed");
    assert.equal(result.update.attemptCount, 4);
    assert.equal(result.update.exhaustedAt, NOW);
  });

  it("classifies a network error as a retryable pending failure", async () => {
    const result = await processConvexWebhookDelivery({
      endpoint: endpoint(),
      delivery: delivery(),
      fetch: throwingFetch,
      now: NOW,
      maxAttempts: 4,
    });

    assert.equal(result.update.status, "pending");
    assert.equal(result.update.failureKind, "network_error");
    assert.equal(result.update.responseBody, "connection reset");
  });

  it("terminates without a network attempt for an inactive endpoint", async () => {
    let fetched = false;
    const fetchFn: ConvexWebhookFetch = async () => {
      fetched = true;
      return { status: 200, text: async () => "" };
    };

    const result = await processConvexWebhookDelivery({
      endpoint: endpoint({ status: "disabled" }),
      delivery: delivery(),
      fetch: fetchFn,
      now: NOW,
    });

    assert.equal(fetched, false);
    assert.equal(result.update.status, "failed");
    assert.equal(result.update.failureKind, "endpoint_inactive");
  });

  it("terminates without a network attempt for a missing endpoint", async () => {
    let fetched = false;
    const fetchFn: ConvexWebhookFetch = async () => {
      fetched = true;
      return { status: 200, text: async () => "" };
    };

    const result = await processConvexWebhookDelivery({
      endpoint: null,
      delivery: delivery(),
      fetch: fetchFn,
      now: NOW,
    });

    assert.equal(fetched, false);
    assert.equal(result.update.failureKind, "endpoint_inactive");
  });

  it("honors a custom header prefix", async () => {
    let capturedHeaders: Record<string, string> | undefined;
    const fetchFn: ConvexWebhookFetch = async (_url, init) => {
      capturedHeaders = init.headers;
      return { status: 200, text: async () => "" };
    };

    await processConvexWebhookDelivery({
      endpoint: endpoint(),
      delivery: delivery(),
      fetch: fetchFn,
      now: NOW,
      headerPrefix: "app",
    });

    assert.ok(capturedHeaders?.["x-app-signature"] !== undefined);
  });
});
