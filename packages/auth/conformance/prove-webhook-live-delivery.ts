/**
 * Live webhook delivery proof — runs against a deployed `convex-auth` app that
 * mounts the proof harness routes in `packages/conformance-consumer/convex/http.ts`.
 *
 * Flow: fire an event -> the turnkey processor signs + POSTs to our sink -> assert
 *   1. the sink received exactly one delivery,
 *   2. its HMAC-SHA256 signature verifies against the endpoint secret,
 *   3. the event-type header is correct,
 *   4. the delivery row reached `delivered` with a 2xx response status.
 *
 * Pass exits 0 and prints [SUCCESS]; fail exits 1 and lists failed checks.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { readJsonObject } from "./_shared";

const SITE = process.env.CONVEX_SITE_URL ?? "";
if (!SITE) {
  console.error("[ERROR] CONVEX_SITE_URL is required");
  process.exit(1);
}

let fails = 0;
const ok = (m: string) => console.log(`[PASS] ${m}`);
const bad = (m: string) => {
  fails += 1;
  console.error(`[FAIL] ${m}`);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type SinkRow = {
  eventId: string;
  eventType: string;
  deliveryHeader?: string;
  signature?: string;
  bodyJson: string;
  receivedAt: number;
};

type DeliveryRow = {
  status: string;
  responseStatus?: number;
  attemptCount: number;
} | null;

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSinkRow(value: unknown): value is SinkRow {
  return (
    isJsonObject(value) &&
    typeof value.eventId === "string" &&
    typeof value.eventType === "string" &&
    typeof value.bodyJson === "string" &&
    typeof value.receivedAt === "number" &&
    (value.deliveryHeader === undefined || typeof value.deliveryHeader === "string") &&
    (value.signature === undefined || typeof value.signature === "string")
  );
}

function readDeliveryRow(value: unknown): DeliveryRow {
  if (value === null) return null;
  if (
    !isJsonObject(value) ||
    typeof value.status !== "string" ||
    typeof value.attemptCount !== "number" ||
    (value.responseStatus !== undefined && typeof value.responseStatus !== "number")
  ) {
    throw new TypeError("Webhook delivery response has an invalid shape");
  }
  return {
    status: value.status,
    attemptCount: value.attemptCount,
    responseStatus: value.responseStatus,
  };
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (!value.every((item) => typeof item === "string")) return undefined;
  return value as string[];
}

const secret = `whsec_live_${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
const eventType = "user.created";
const payloadJson = JSON.stringify({
  id: `evt_live_${Date.now()}`,
  type: eventType,
  data: { userId: "u_live_proof" },
});

let endpointId: string | undefined;
let eventId = "";

try {
  /*
   * 0. Reset: clear any proof endpoints left by prior runs so this event fans
   *    out to exactly one endpoint (otherwise stale endpoints duplicate it).
   */
  await fetch(`${SITE}/api/proofs/webhook-reset`, { method: "POST" });

  /*
   * 1. Fire: create endpoint + enqueue + kick immediate processing. The sink
   *    URL is derived server-side from the deployment origin (no SSRF surface).
   */
  const fireRes = await fetch(`${SITE}/api/proofs/fire-webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventType, payloadJson, secret }),
  });
  const fire = await readJsonObject(fireRes);
  const deliveryIds = readStringArray(fire.deliveryIds);
  if (!fireRes.ok || fire.ok !== true || typeof fire.eventId !== "string" || !deliveryIds?.length) {
    const failureMessage =
      typeof fire.message === "string" ? fire.message : `status ${fireRes.status}`;
    bad(`fire-webhook failed: ${failureMessage}`);
    throw new Error("fire-webhook did not enqueue a delivery");
  }
  endpointId = typeof fire.endpointId === "string" ? fire.endpointId : undefined;
  eventId = fire.eventId;
  const deliveryId = deliveryIds[0];
  if (deliveryId === undefined) throw new Error("Missing delivery id");
  ok(`fire: endpoint created + 1 delivery enqueued (eventId ${eventId})`);

  /* 2. Poll the sink until the cron delivers (real async round trip). */
  let received: SinkRow[] = [];
  for (let attempt = 0; attempt < 30 && received.length === 0; attempt += 1) {
    await sleep(1000);
    const res = await fetch(
      `${SITE}/api/proofs/webhook-sink?eventId=${encodeURIComponent(eventId)}`,
    );
    const data = await readJsonObject(res);
    if (!Array.isArray(data.received) || !data.received.every(isSinkRow)) {
      throw new TypeError("Webhook sink response has an invalid shape");
    }
    received = data.received as SinkRow[];
  }

  if (received.length === 1) {
    ok("delivery: sink received exactly one signed webhook");
  } else {
    bad(`delivery: expected exactly 1 received webhook, got ${received.length}`);
  }

  const row = received[0];
  if (row) {
    /* 3. Signature verifies against the endpoint secret. */
    const expected = createHmac("sha256", secret).update(row.bodyJson).digest("hex");
    const got = row.signature ?? "";
    const gotBuf = Buffer.from(got, "utf8");
    const expBuf = Buffer.from(expected, "utf8");
    if (gotBuf.length === expBuf.length && timingSafeEqual(gotBuf, expBuf)) {
      ok("signing: received HMAC-SHA256 signature verifies against endpoint secret");
    } else {
      bad("signing: received signature does not match HMAC of received body");
    }
    if (row.bodyJson === payloadJson) {
      ok("delivery: received body is byte-identical to the enqueued payload");
    } else {
      bad("delivery: received body differs from the enqueued payload");
    }
    if (row.eventType === eventType) {
      ok(`delivery: event-type header correct (${row.eventType})`);
    } else {
      bad(`delivery: event-type header was ${row.eventType}, expected ${eventType}`);
    }
  }

  /* 4. The delivery row reached `delivered` with a 2xx response status. */
  let delivery: DeliveryRow = null;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const res = await fetch(
      `${SITE}/api/proofs/webhook-delivery?deliveryId=${encodeURIComponent(deliveryId)}`,
    );
    const data = await readJsonObject(res);
    delivery = readDeliveryRow(data.delivery);
    if (delivery && delivery.status === "delivered") break;
    await sleep(1000);
  }
  if (delivery && delivery.status === "delivered") {
    ok(`delivery row: reached 'delivered' on attempt ${delivery.attemptCount}`);
    if (typeof delivery.responseStatus === "number" && delivery.responseStatus < 300) {
      ok(`delivery row: recorded 2xx response status (${delivery.responseStatus})`);
    } else {
      bad(`delivery row: response status was ${String(delivery.responseStatus)}`);
    }
  } else {
    bad(`delivery row: status was '${delivery?.status ?? "missing"}', expected 'delivered'`);
  }
} finally {
  /* Cleanup so repeated CI runs stay isolated. */
  await fetch(`${SITE}/api/proofs/webhook-cleanup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpointId, eventId }),
  }).catch(() => undefined);
}

console.log(
  fails === 0
    ? "\n[SUCCESS] live webhook delivery round trip"
    : `\n[FAILURE] ${fails} check${fails === 1 ? "" : "s"} failed for live webhook delivery.`,
);
process.exit(fails === 0 ? 0 : 1);
