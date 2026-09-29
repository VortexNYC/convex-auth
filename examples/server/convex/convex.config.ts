import { defineApp } from "convex/server";
import { v } from "convex/values";
import auth from "@vortex-api/convex-auth/convex.config";

const app = defineApp({
  env: {
    JWT_PRIVATE_KEY: v.string(),
    JWKS: v.string(),
    DISCORD_CLIENT_ID: v.optional(v.string()),
    DISCORD_CLIENT_SECRET: v.optional(v.string()),
    EMAIL_FROM_ADDRESS: v.optional(v.string()),
    GITHUB_CLIENT_ID: v.optional(v.string()),
    GITHUB_CLIENT_SECRET: v.optional(v.string()),
    GOOGLE_CLIENT_ID: v.optional(v.string()),
    GOOGLE_CLIENT_SECRET: v.optional(v.string()),
    SITE_URL: v.optional(v.string()),
    /* TEST-ONLY: a JWKS JSON served in place of Google's certs endpoint so
     * signInOneTap can be driven end-to-end without a real Google-issued
     * token. Requires CONVEX_AUTH_E2E="true" alongside it; leave both unset
     * everywhere else — they must never exist in prod. */
    CONVEX_AUTH_E2E: v.optional(v.string()),
    CONVEX_AUTH_TEST_JWKS: v.optional(v.string()),
  },
});

app.use(auth, {
  env: {
    JWT_PRIVATE_KEY: app.env.JWT_PRIVATE_KEY,
    JWKS: app.env.JWKS,
  },
});

export default app;
