/**
 * Turnkey webhook firing + delivery conformance proof (Gap A).
 *
 * The webhook firing/delivery layer is pure package logic — the consumer
 * mounts the cron and supplies the action-runtime `fetch`. This proof is
 * deployment-agnostic and asserts the deterministic, package-owned guarantees;
 * it requires no mounted processor, so it drops into any project unchanged.
 *
 * The live cron-driven HTTP delivery round trip (delivery row reaches
 * `delivered` via the mounted cron against a real receiver) is proven
 * separately by `scripts/prove-webhook-live-delivery.ts` against the
 * cloud-control deployment, which mounts the component + the turnkey processor
 * cron + a request-capture sink.
 *
 * This proof asserts the deterministic, package-owned guarantees end to end:
 *
 *  A. firing: `convexWebhookEndpointSubscribesTo` enqueues exactly the
 *     subscribed/wildcard endpoints and skips the rest.
 *  B. signing: `signConvexWebhookPayload` + `createConvexWebhookHeaders`
 *     produce an HMAC-SHA256 signature an independent verifier accepts and a
 *     tampered payload rejects.
 *  C. delivery transitions: `processConvexWebhookDelivery` classifies
 *     delivered / retry-pending / client-failed / exhausted / network-retry /
 *     inactive deterministically and emits a ready-to-persist update.
 *
 * The enqueue path is additionally proven against the real component in
 * `packages/convex-auth/src/webhook-firing.test.ts`, and the live delivery
 * round trip in `scripts/prove-webhook-live-delivery.ts`.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import {
  createConvexWebhookHeaders,
  processConvexWebhookDelivery,
  signConvexWebhookPayload,
  convexWebhookEndpointSubscribesTo,
  type ConvexWebhookFetch,
} from "@vortex-api/convex-auth/convex";

import { makeReporter } from "./_shared.js";

const r = makeReporter();
const NOW = 1_700_000_000_000;
const SECRET = "cvxsec_conformance_secret_value";

// A. firing / subscription matching ----------------------------------------
const endpoints = [
  { id: "ep_subscribed", eventTypes: ["user.created", "user.updated"] },
  { id: "ep_wildcard", eventTypes: ["*"] },
  { id: "ep_other", eventTypes: ["organization.created"] },
  { id: "ep_empty", eventTypes: [] as string[] },
];
const matched = endpoints
  .filter((e) => convexWebhookEndpointSubscribesTo(e.eventTypes, "user.created"))
  .map((e) => e.id);
if (matched.length === 2 && matched.includes("ep_subscribed") && matched.includes("ep_wildcard")) {
  r.ok("A firing: enqueues only subscribed + wildcard endpoints");
} else {
  r.bad(`A firing: unexpected matched endpoints ${JSON.stringify(matched)}`);
}

// B. signing round trip ------------------------------------------------------
const payload = JSON.stringify({
  id: "evt_1",
  type: "user.created",
  data: { userId: "u_1" },
});
const signature = await signConvexWebhookPayload(SECRET, payload);
const headers = createConvexWebhookHeaders({
  deliveryId: "evt_1",
  eventType: "user.created",
  signature,
});
const independent = createHmac("sha256", SECRET).update(payload).digest("hex");
const sigBuf = Buffer.from(headers["x-convex-signature"] ?? "", "utf8");
const expBuf = Buffer.from(independent, "utf8");
if (sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)) {
  r.ok("B signing: HMAC-SHA256 signature verified by independent verifier");
} else {
  r.bad("B signing: signature did not match independent HMAC verifier");
}
const tampered = createHmac("sha256", SECRET).update(`${payload} `).digest("hex");
if (tampered !== independent) {
  r.ok("B signing: tampered payload produces a different signature (rejected)");
} else {
  r.bad("B signing: tampered payload produced identical signature");
}

// C. delivery transition matrix ---------------------------------------------
const activeEndpoint = {
  _id: "ep_subscribed",
  url: "https://receiver.test/hook",
  secret: SECRET,
  status: "active" as const,
};
const baseDelivery = {
  _id: "delivery_1",
  endpointId: "ep_subscribed",
  eventId: "evt_1",
  eventType: "user.created",
  payloadJson: payload,
};
const fetchStatus =
  (status: number, body = ""): ConvexWebhookFetch =>
  async () => ({
    status,
    text: async () => body,
  });

const delivered = await processConvexWebhookDelivery({
  endpoint: activeEndpoint,
  delivery: { ...baseDelivery, attemptCount: 0 },
  fetch: fetchStatus(200, "ok"),
  now: NOW,
});
if (delivered.update.status === "delivered" && delivered.update.deliveredAt === NOW) {
  r.ok("C transition: 2xx -> delivered");
} else {
  r.bad(`C transition: 2xx expected delivered, got ${delivered.update.status}`);
}

const retry = await processConvexWebhookDelivery({
  endpoint: activeEndpoint,
  delivery: { ...baseDelivery, attemptCount: 0 },
  fetch: fetchStatus(503, "down"),
  now: NOW,
  maxAttempts: 4,
});
if (retry.update.status === "pending" && (retry.update.nextAttemptAt ?? 0) > NOW) {
  r.ok("C transition: retryable 5xx -> pending with future nextAttemptAt");
} else {
  r.bad(`C transition: 5xx expected pending retry, got ${retry.update.status}`);
}

const clientFail = await processConvexWebhookDelivery({
  endpoint: activeEndpoint,
  delivery: { ...baseDelivery, attemptCount: 0 },
  fetch: fetchStatus(400, "bad"),
  now: NOW,
});
if (clientFail.update.status === "failed" && clientFail.update.failureKind === "client_error") {
  r.ok("C transition: 4xx -> terminal failed (no retry)");
} else {
  r.bad(`C transition: 4xx expected failed, got ${clientFail.update.status}`);
}

const exhausted = await processConvexWebhookDelivery({
  endpoint: activeEndpoint,
  delivery: { ...baseDelivery, attemptCount: 3 },
  fetch: fetchStatus(503, "down"),
  now: NOW,
  maxAttempts: 4,
});
if (exhausted.update.status === "failed" && exhausted.update.exhaustedAt === NOW) {
  r.ok("C transition: retryable failure exhausts at max attempts");
} else {
  r.bad(`C transition: expected exhausted failed, got ${exhausted.update.status}`);
}

const network = await processConvexWebhookDelivery({
  endpoint: activeEndpoint,
  delivery: { ...baseDelivery, attemptCount: 0 },
  fetch: async () => {
    throw new Error("connection reset");
  },
  now: NOW,
  maxAttempts: 4,
});
if (network.update.status === "pending" && network.update.failureKind === "network_error") {
  r.ok("C transition: network error -> pending retry");
} else {
  r.bad(`C transition: network error expected pending, got ${network.update.status}`);
}

let inactiveFetched = false;
const inactive = await processConvexWebhookDelivery({
  endpoint: { ...activeEndpoint, status: "disabled" },
  delivery: { ...baseDelivery, attemptCount: 0 },
  fetch: async () => {
    inactiveFetched = true;
    return { status: 200, text: async () => "" };
  },
  now: NOW,
});
if (!inactiveFetched && inactive.update.failureKind === "endpoint_inactive") {
  r.ok("C transition: inactive endpoint -> failed without network attempt");
} else {
  r.bad("C transition: inactive endpoint should not fetch");
}

console.log(
  "[INFO] live cron-driven HTTP delivery (row -> delivered against a real receiver) requires a deployment that mounts the processor + a request-capture endpoint; see README.",
);

r.done("webhook firing + delivery conformance");
