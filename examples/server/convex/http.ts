import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);

/* Webhook receiver sink — records the signed delivery for the live proof. */
http.route({
  path: "/webhooks/receiver",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const bodyJson = await request.text();
    let eventType = request.headers.get("x-convex-event") ?? "";
    let eventId = request.headers.get("x-convex-delivery") ?? "";
    try {
      const parsed = JSON.parse(bodyJson) as { id?: unknown; type?: unknown };
      if (typeof parsed.id === "string" && parsed.id.length > 0) eventId = parsed.id;
      if (typeof parsed.type === "string" && parsed.type.length > 0) eventType = parsed.type;
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
  handler: httpAction(async () => new Response("simulated outage", { status: 500 })),
});
http.route({
  path: "/webhooks/reject-400",
  method: "POST",
  handler: httpAction(async () => new Response("bad request", { status: 400 })),
});

export default http;
