import { defineApp } from "convex/server";
import { v } from "convex/values";
import auth from "@vortex-api/convex-auth/convex.config";
import staticHosting from "@convex-dev/static-hosting/convex.config";

const app = defineApp({
  env: {
    JWT_PRIVATE_KEY: v.string(),
    JWKS: v.string(),
    ALLOW_EMAIL_TOKEN_FALLBACK: v.optional(v.string()),
    DISCORD_CLIENT_ID: v.optional(v.string()),
    DISCORD_CLIENT_SECRET: v.optional(v.string()),
    EMAIL_FROM_ADDRESS: v.optional(v.string()),
    GITHUB_CLIENT_ID: v.optional(v.string()),
    GITHUB_CLIENT_SECRET: v.optional(v.string()),
    GOOGLE_CLIENT_ID: v.optional(v.string()),
    GOOGLE_CLIENT_SECRET: v.optional(v.string()),
    OAUTH_OIDC_CLIENT_ID: v.optional(v.string()),
    OAUTH_OIDC_CLIENT_SECRET: v.optional(v.string()),
    OAUTH_OIDC_DISCOVERY: v.optional(v.string()),
    OAUTH_OIDC_ISSUER: v.optional(v.string()),
    OAUTH_OIDC_SCOPES: v.optional(v.string()),
    OAUTH_OIDC_USE_ID_TOKEN: v.optional(v.string()),
    OAUTH_PROVIDER_CLIENT_ID: v.optional(v.string()),
    OAUTH_PROVIDER_CLIENT_NAME: v.optional(v.string()),
    OAUTH_PROVIDER_LOGIN_URL: v.optional(v.string()),
    OAUTH_PROVIDER_REDIRECT_URIS: v.optional(v.string()),
    OAUTH_PROVIDER_SCOPES: v.optional(v.string()),
    SITE_URL: v.optional(v.string()),
    TURNSTILE_SECRET_KEY: v.optional(v.string()),
  },
});

app.use(auth, {
  env: {
    JWT_PRIVATE_KEY: app.env.JWT_PRIVATE_KEY,
    JWKS: app.env.JWKS,
  },
});

app.use(staticHosting);

export default app;
