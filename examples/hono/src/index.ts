import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { convexAuthMiddleware, getConvexAuthSession } from "@vortex-api/convex-auth/hono";
import { api } from "../convex/_generated/api";

const app = new Hono();

// One registration is the whole server surface: it proxies POST /api/auth
// auth intents, lands OAuth/magic-link session triples as cookies, rotates
// sessions near expiry onto downstream responses, and keeps cross-origin
// auth cookies off your handlers.
app.use("*", convexAuthMiddleware({ actions: api.auth }));

app.get("/", (c) => c.json({ ok: true, message: "convex-auth hono example" }));

// Verified, revocation-aware session — resolves null for dead or revoked
// sessions even when the JWT is still structurally valid.
app.get("/me", async (c) => {
  const session = await getConvexAuthSession(c, { actions: api.auth });
  if (session === null) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return c.json(session);
});

const port = Number(process.env.PORT ?? "3000");

serve({
  fetch: app.fetch,
  port,
});
