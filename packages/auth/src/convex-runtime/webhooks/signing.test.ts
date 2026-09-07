import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  createConvexWebhookHeaders,
  createConvexWebhookSecret,
  getConvexWebhookSecretPreview,
  signConvexWebhookPayload,
  verifyConvexWebhookRequest,
  verifyConvexWebhookSignature,
} from "./signing";

describe("webhook signing helpers", () => {
  it("creates package-formatted webhook secrets", () => {
    const uuids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
    const secret = createConvexWebhookSecret(() => {
      const value = uuids.shift();
      if (!value) throw new Error("missing uuid");
      return value;
    });

    assert.equal(secret, "cvxsec_1111111111114111811111111111111122222222222242228222222222222222");
  });

  it("creates stable secret previews", () => {
    assert.equal(
      getConvexWebhookSecretPreview("cvxsec_abcdefghijklmnopqrstuvwxyz"),
      "cvxsec_abc...uvwxyz",
    );
  });

  it("signs payloads with HMAC SHA-256", async () => {
    const signature = await signConvexWebhookPayload("cvxsec_test", '{"ok":true}');
    assert.equal(signature.length, 64);
    assert.match(signature, /^[a-f0-9]+$/);
  });

  it("verifies a signature it produced and rejects tampering", async () => {
    const secret = "cvxsec_inbound";
    const payload = '{"event":"user.created","id":"u_1"}';
    const signature = await signConvexWebhookPayload(secret, payload);

    assert.equal(await verifyConvexWebhookSignature(secret, payload, signature), true);
    // Wrong secret, tampered payload, wrong/empty/missing signature all fail closed.
    assert.equal(await verifyConvexWebhookSignature("cvxsec_other", payload, signature), false);
    assert.equal(await verifyConvexWebhookSignature(secret, payload + " ", signature), false);
    assert.equal(await verifyConvexWebhookSignature(secret, payload, "deadbeef"), false);
    assert.equal(await verifyConvexWebhookSignature(secret, payload, ""), false);
    assert.equal(await verifyConvexWebhookSignature(secret, payload, null), false);
  });

  it("verifies via the request header helper", async () => {
    const secret = "cvxsec_inbound";
    const payload = '{"event":"member.added"}';
    const signature = await signConvexWebhookPayload(secret, payload);
    const headers = new Headers({ "x-convex-signature": signature });
    assert.equal(await verifyConvexWebhookRequest({ secret, payload, headers }), true);

    const forged = new Headers({ "x-convex-signature": "00".repeat(32) });
    assert.equal(await verifyConvexWebhookRequest({ secret, payload, headers: forged }), false);
    // No signature header at all → rejected.
    assert.equal(
      await verifyConvexWebhookRequest({
        secret,
        payload,
        headers: new Headers(),
      }),
      false,
    );
  });

  it("creates prefixed delivery headers", () => {
    assert.deepEqual(
      createConvexWebhookHeaders({
        eventType: "organization.member.added",
        deliveryId: "evt_1",
        signature: "abc",
        prefix: "app",
      }),
      {
        "content-type": "application/json",
        "x-app-delivery": "evt_1",
        "x-app-event": "organization.member.added",
        "x-app-signature": "abc",
      },
    );
  });
});
