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
    PASSKEY_ANDROID_PACKAGE: v.optional(v.string()),
    PASSKEY_ANDROID_SHA256_CERT_FINGERPRINT: v.optional(v.string()),
    PASSKEY_IOS_APP_ID: v.optional(v.string()),
    PASSKEY_ORIGINS: v.optional(v.string()),
    PASSKEY_RP_ID: v.optional(v.string()),
    SITE_URL: v.optional(v.string()),
  },
});

app.use(auth, {
  env: {
    JWT_PRIVATE_KEY: app.env.JWT_PRIVATE_KEY,
    JWKS: app.env.JWKS,
  },
});

export default app;
