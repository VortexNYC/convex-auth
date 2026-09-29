import { ConvexHttpClient } from "convex/browser";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const envPath = join(dirname(fileURLToPath(import.meta.url)), ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const URL_ = env.CONVEX_URL ?? process.env.CONVEX_URL;
const SITE = URL_.replace(".convex.cloud", ".convex.site");

const client = new ConvexHttpClient(URL_);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0;
let fail = 0;
const expect = (cond, msg) => {
  if (cond) {
    pass++;
    console.log("PASS:", msg);
  } else {
    fail++;
    console.log("FAIL:", msg);
  }
};

const signin = await client.action("auth:signInUsername", {
  username: "cli-webhook-driver",
  password: "Driver-Pass-1234!",
});
client.setAuth(signin.token);
console.log("signed in as", signin.user.username);

// unauthenticated rejection
const anon = new ConvexHttpClient(URL_);
try {
  await anon.mutation("webhooks:createEndpoint", {
    url: `${SITE}/webhooks/receiver`,
    eventTypes: ["*"],
  });
  expect(false, "unauthenticated createEndpoint succeeded");
} catch (e) {
  expect(
    String(e.message).includes("Authentication required"),
    `unauthenticated createEndpoint rejected (${String(e.message).slice(0, 60)})`,
  );
}

// anonymous sessions carry an identity but are not real accounts — the proof
// paths must reject them even with the flag on (outbound-fetch surface)
const anonSignin = await anon.action("auth:signInAnonymous", {});
console.log("anon session minted:", !!anonSignin.token);
anon.setAuth(anonSignin.token);
try {
  await anon.mutation("webhooks:createEndpoint", {
    url: `${SITE}/webhooks/receiver`,
    eventTypes: ["*"],
  });
  expect(false, "anonymous+flag createEndpoint succeeded (should reject)");
} catch (e) {
  expect(
    String(e.message).includes("non-anonymous"),
    `anonymous createEndpoint rejected (${String(e.message).slice(0, 80)})`,
  );
}

// reset sink + delete every stale global endpoint from prior runs
const reset = await client.mutation("webhooks:resetProofState", {});
expect(reset.ok === true, "proof state reset (sink wiped, stale global endpoints deleted)");

// endpoints: good receiver + 500 + 400 + wrong-event
const epGood = await client.mutation("webhooks:createEndpoint", {
  url: `${SITE}/webhooks/receiver`,
  eventTypes: ["user.created"],
});
await client.mutation("webhooks:createEndpoint", {
  url: `${SITE}/webhooks/fail-500`,
  eventTypes: ["user.created"],
});
await client.mutation("webhooks:createEndpoint", {
  url: `${SITE}/webhooks/reject-400`,
  eventTypes: ["user.created"],
});
await client.mutation("webhooks:createEndpoint", {
  url: `${SITE}/webhooks/receiver`,
  eventTypes: ["user.deleted"],
});
console.log("endpoints created");

// enqueue user.created
const payload = JSON.stringify({
  id: "evt-payload-id",
  type: "user.created",
  data: { userId: "u_x" },
});
const enq = await client.mutation("webhooks:enqueueEvent", {
  eventType: "user.created",
  payloadJson: payload,
});
expect(
  enq.enqueued === 3,
  `fan-out: 3 subscribed deliveries, filtered endpoint skipped (got ${enq.enqueued})`,
);

await client.mutation("webhooks:kickProcessing", {});

// poll sink by delivery eventId (x-convex-delivery)
let rows = [];
for (let i = 0; i < 25 && rows.length === 0; i++) {
  await sleep(1000);
  rows = await client.query("webhooks:listSinkRows", { eventId: enq.eventId });
}
expect(rows.length === 1, `sink received exactly 1 row (got ${rows.length})`);
if (rows.length === 1) {
  const row = rows[0];
  const expected = createHmac("sha256", epGood.secret).update(payload).digest("hex");
  expect(row.signature === expected, "HMAC signature verified against endpoint secret");
  expect(row.bodyJson === payload, "body byte-identical");
  expect(row.eventType === "user.created", `event type header correct (${row.eventType})`);
  expect(row.deliveryHeader === enq.eventId, "delivery header = eventId");
}

// delivery outcomes for the 3 enqueued
const outcomes = [];
for (const dId of enq.deliveryIds) {
  const d = await client.query("webhooks:getDelivery", { deliveryId: dId });
  outcomes.push(d);
  console.log("  delivery:", JSON.stringify(d));
}
const delivered = outcomes.filter((d) => d?.status === "delivered" && d?.responseStatus === 200);
const pending = outcomes.filter(
  (d) => d?.status === "pending" && d?.failureKind === "server_error",
);
const failedRows = outcomes.filter(
  (d) => d?.status === "failed" && d?.failureKind === "client_error",
);
expect(delivered.length === 1, `1 delivery delivered/200 (got ${delivered.length})`);
expect(pending.length === 1, `500 -> pending + server_error + backoff (got ${pending.length})`);
expect(failedRows.length === 1, `400 -> terminal failed + client_error (got ${failedRows.length})`);

// retry after backoff
const pendingId = enq.deliveryIds.find((dId, i) => outcomes[i]?.status === "pending");
if (pendingId) {
  const d1 = await client.query("webhooks:getDelivery", { deliveryId: pendingId });
  const waitMs = Math.max(0, d1.nextAttemptAt - Date.now()) + 500;
  console.log(`waiting ${Math.round(waitMs / 1000)}s for retry window…`);
  await sleep(Math.min(waitMs, 90000));
  await client.mutation("webhooks:kickProcessing", {});
  await sleep(3000);
  const d2 = await client.query("webhooks:getDelivery", { deliveryId: pendingId });
  expect(
    d2.attemptCount >= 2 && d2.status === "pending",
    `retry loop re-attempted (attemptCount ${d2.attemptCount}, still pending, next backoff)`,
  );
}

// cleanup: leave no live endpoints on the shared deployment
const cleanup = await client.mutation("webhooks:resetProofState", {});
expect(cleanup.ok === true, "post-run cleanup done");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
