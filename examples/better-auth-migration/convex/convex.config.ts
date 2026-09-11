import { defineApp } from "convex/server";
import { v } from "convex/values";
import betterAuth from "@convex-dev/better-auth/convex.config";
import convexAuth from "@vortex-api/convex-auth/convex.config";

const app = defineApp({
  env: {
    JWT_PRIVATE_KEY: v.string(),
    JWKS: v.string(),
    BETTER_AUTH_SECRET: v.optional(v.string()),
    BETTER_AUTH_URL: v.optional(v.string()),
  },
});

app.use(betterAuth, { env: app.env });
app.use(convexAuth, { env: { JWT_PRIVATE_KEY: app.env.JWT_PRIVATE_KEY, JWKS: app.env.JWKS } });

export default app;
