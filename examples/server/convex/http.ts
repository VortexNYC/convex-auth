import { httpRouter } from "convex/server";
import { env, httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { registerMcpOAuthRoutes } from "./mcp";

const http = httpRouter();
auth.addHttpRoutes(http);
registerMcpOAuthRoutes(http);

/* TEST-ONLY: webhook proof receivers for the e2e fixture. Every route 404s
 * unless ENABLE_WEBHOOK_PROOFS=true is set on the deployment — they must never
 * exist in a real app, and they accept no auth because the delivery worker
 * cannot present one (signatures are verified by whoever reads the sink). */
const MAX_SINK_BODY_BYTES = 64 * 1024;

function proofsDisabled(): boolean {
  return env.ENABLE_WEBHOOK_PROOFS !== "true";
}

http.route({
  path: "/webhooks/receiver",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (proofsDisabled()) {
      return new Response("not found", { status: 404 });
    }
    const bodyJson = await request.text();
    if (bodyJson.length > MAX_SINK_BODY_BYTES) {
      return new Response("payload too large", { status: 413 });
    }
    /* The canonical delivery id is the x-convex-delivery header (the eventId
     * the component stored on the delivery row); the payload `id`/`type` are
     * payload-level fields a real provider would send inside the body. */
    let eventId = request.headers.get("x-convex-delivery") ?? "";
    let eventType = request.headers.get("x-convex-event") ?? "";
    try {
      const parsed = JSON.parse(bodyJson) as { id?: unknown; type?: unknown };
      if (eventId === "" && typeof parsed.id === "string") eventId = parsed.id;
      if (eventType === "" && typeof parsed.type === "string") eventType = parsed.type;
    } catch {
      /* keep header-derived values */
    }
    await ctx.runMutation(internal.webhooks.insertSinkRow, {
      eventId,
      eventType,
      deliveryHeader: request.headers.get("x-convex-delivery") ?? undefined,
      signature: request.headers.get("x-convex-signature") ?? undefined,
      bodyJson,
    });
    return new Response("ok", { status: 200 });
  }),
});

/* Failure matrix receivers. */
http.route({
  path: "/webhooks/fail-500",
  method: "POST",
  handler: httpAction(async () =>
    proofsDisabled()
      ? new Response("not found", { status: 404 })
      : new Response("simulated outage", { status: 500 }),
  ),
});
http.route({
  path: "/webhooks/reject-400",
  method: "POST",
  handler: httpAction(async () =>
    proofsDisabled()
      ? new Response("not found", { status: 404 })
      : new Response("bad request", { status: 400 }),
  ),
});

export default http;
