import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  checkWebhookEndpointActive,
  classifyWebhookEndpointStatusTransition,
  createConvexWebhookEndpointListItem,
  createConvexWebhookDeliveryListItem,
  getConvexWebhookEndpointSecretPreview,
  normalizeConvexWebhookEndpointEventTypes,
  normalizeConvexWebhookEndpointUrl,
  requireWebhookEndpointActive,
} from "./endpointLifecycle";
import type { ConvexWebhookEndpointStatus } from "./types";

describe("webhook endpoint lifecycle", () => {
  it("normalizes webhook endpoint URLs", () => {
    assert.equal(
      normalizeConvexWebhookEndpointUrl(" https://example.com/webhooks "),
      "https://example.com/webhooks",
    );
    assert.throws(() => normalizeConvexWebhookEndpointUrl(""), /URL is required/);
    assert.throws(() => normalizeConvexWebhookEndpointUrl("ftp://example.com"), /must start with/);
  });

  it("rejects SSRF targets (metadata, loopback, private, internal)", () => {
    const blocked = [
      "http://169.254.169.254/latest/meta-data/",
      "http://127.0.0.1/admin",
      "http://localhost:8080/",
      "https://service.internal/hook",
      "http://10.0.0.5/",
      "http://172.16.4.4/",
      "http://192.168.1.1/",
      "http://0.0.0.0/",
      "http://[::1]/",
      "http://[fd00::1]/",
      "http://[fe80::1]/",
      "http://[::ffff:169.254.169.254]/",
    ];
    for (const url of blocked) {
      assert.throws(
        () => normalizeConvexWebhookEndpointUrl(url),
        /not allowed|must include a host/,
        url,
      );
    }
    /* Public hosts and public IP literals still pass. */
    assert.equal(
      normalizeConvexWebhookEndpointUrl("https://hooks.example.com/in"),
      "https://hooks.example.com/in",
    );
    assert.equal(normalizeConvexWebhookEndpointUrl("http://8.8.8.8/in"), "http://8.8.8.8/in");
  });

  it("normalizes event types and defaults to wildcard", () => {
    assert.deepEqual(
      normalizeConvexWebhookEndpointEventTypes(["invoice.created ", " payment.received"]),
      ["invoice.created", "payment.received"],
    );
    assert.deepEqual(normalizeConvexWebhookEndpointEventTypes([]), ["*"]);
    assert.deepEqual(normalizeConvexWebhookEndpointEventTypes(["  ", ""]), ["*"]);
  });

  it("builds endpoint list items without exposing full secrets", () => {
    const item = createConvexWebhookEndpointListItem({
      endpoint: {
        _id: "endpoint-1",
        url: "https://example.com/webhooks",
        description: "Production",
        eventTypes: ["invoice.created"],
        secret: "cvxsec_abc123def456",
        status: "active",
        createdAt: 1,
        updatedAt: 2,
      },
    });
    assert.equal(item.secretPreview, "cvxsec_abc...def456");
    assert.equal(item.status, "active");
    assert.deepEqual(item.eventTypes, ["invoice.created"]);
  });

  it("builds delivery list items from raw delivery docs", () => {
    const item = createConvexWebhookDeliveryListItem({
      delivery: {
        _id: "delivery-1",
        endpointId: "endpoint-1",
        eventId: "evt_123",
        eventType: "invoice.created",
        payloadJson: "{}",
        status: "pending",
        attemptCount: 1,
        nextAttemptAt: 1000,
        createdAt: 0,
        updatedAt: 0,
      },
    });
    assert.equal(item.eventType, "invoice.created");
    assert.equal(item.attemptCount, 1);
    assert.equal(item.nextAttemptAt, 1000);
  });

  it("previews short secrets safely", () => {
    assert.equal(getConvexWebhookEndpointSecretPreview("short"), "sho...");
    assert.equal(
      getConvexWebhookEndpointSecretPreview("cvxsec_abc123def456"),
      "cvxsec_abc...def456",
    );
  });

  it("classifies endpoint activity by status", () => {
    const active = checkWebhookEndpointActive({
      endpoint: { _id: "ep-1", status: "active" },
    });
    assert.equal(active.active, true);

    const disabled = checkWebhookEndpointActive({
      endpoint: { _id: "ep-1", status: "disabled" },
    });
    assert.equal(disabled.active, false);
    assert.equal(disabled.reason, "disabled");

    const archived = checkWebhookEndpointActive({
      endpoint: { _id: "ep-1", status: "archived" },
    });
    assert.equal(archived.active, false);
    assert.equal(archived.reason, "archived");

    const missing = checkWebhookEndpointActive({ endpoint: null });
    assert.equal(missing.active, false);
    assert.equal(missing.reason, "endpoint_not_found");
  });

  it("requires active endpoints or throws", () => {
    assert.doesNotThrow(() =>
      requireWebhookEndpointActive({
        endpoint: { _id: "ep-1", status: "active" },
      }),
    );
    assert.throws(
      () =>
        requireWebhookEndpointActive({
          endpoint: { _id: "ep-1", status: "disabled" },
        }),
      /not active/,
    );
    assert.throws(() => requireWebhookEndpointActive({ endpoint: null }), /not active/);
  });

  it("classifies valid and invalid status transitions", () => {
    const valid: Array<{
      from: ConvexWebhookEndpointStatus;
      to: ConvexWebhookEndpointStatus;
    }> = [
      { from: "active", to: "disabled" },
      { from: "active", to: "archived" },
      { from: "disabled", to: "active" },
      { from: "disabled", to: "archived" },
      { from: "archived", to: "active" },
      { from: "archived", to: "disabled" },
    ];
    for (const v of valid) {
      const decision = classifyWebhookEndpointStatusTransition(v);
      assert.equal(decision.ok, true, `transition ${v.from} -> ${v.to} should be valid`);
    }

    assert.equal(
      classifyWebhookEndpointStatusTransition({ from: "active", to: "active" }).ok,
      true,
    );
  });
});
