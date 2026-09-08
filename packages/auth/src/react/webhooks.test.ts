import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  canSubmitConvexWebhookCreateForm,
  getConvexWebhookMutationErrorMessage,
  getConvexWebhookFailureKindLabel,
  getConvexWebhookFailureKindTone,
  type ConvexWebhookDeliveryFailureKind,
} from "./webhooks";

describe("webhook helpers", () => {
  it("blocks webhook creation unless the endpoint is enabled and has a URL", () => {
    assert.equal(
      canSubmitConvexWebhookCreateForm({
        creating: false,
        enabled: false,
        url: "https://example.com/webhooks",
      }),
      false,
    );
    assert.equal(
      canSubmitConvexWebhookCreateForm({
        creating: true,
        enabled: true,
        url: "https://example.com/webhooks",
      }),
      false,
    );
    assert.equal(
      canSubmitConvexWebhookCreateForm({
        creating: false,
        enabled: true,
        url: " ",
      }),
      false,
    );
    assert.equal(
      canSubmitConvexWebhookCreateForm({
        creating: false,
        enabled: true,
        url: "https://example.com/webhooks",
      }),
      true,
    );
  });

  it("formats webhook failure kinds for display", () => {
    assert.equal(getConvexWebhookFailureKindLabel("endpoint_inactive"), "endpoint inactive");
    assert.equal(getConvexWebhookFailureKindLabel("network_error"), "network error");
  });

  it("maps failure kinds to stable tones", () => {
    const cases: Array<{
      failureKind: ConvexWebhookDeliveryFailureKind;
      tone: ReturnType<typeof getConvexWebhookFailureKindTone>;
    }> = [
      { failureKind: "client_error", tone: "destructive" },
      { failureKind: "endpoint_inactive", tone: "destructive" },
      { failureKind: "rate_limited", tone: "warning" },
      { failureKind: "server_error", tone: "warning" },
      { failureKind: "network_error", tone: "secondary" },
      { failureKind: "unknown_error", tone: "secondary" },
    ];

    for (const item of cases) {
      assert.equal(getConvexWebhookFailureKindTone(item.failureKind), item.tone);
    }
  });

  it("keeps webhook mutation error messages user-facing with a fallback", () => {
    assert.equal(
      getConvexWebhookMutationErrorMessage(new Error("Endpoint already exists."), "Fallback"),
      "Endpoint already exists.",
    );
    assert.equal(
      getConvexWebhookMutationErrorMessage("Rate limited.", "Fallback"),
      "Rate limited.",
    );
    assert.equal(getConvexWebhookMutationErrorMessage(null, "Fallback"), "Fallback");
  });
});
