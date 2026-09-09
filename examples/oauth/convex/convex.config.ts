import { defineApp } from "convex/server";
import { v } from "convex/values";
import auth from "convex-auth/convex.config";
import organizations from "convex-auth/convex.config/organizations";
import staticHosting from "@convex-dev/static-hosting/convex.config";

const app = defineApp({
  env: {
    JWT_PRIVATE_KEY: v.string(),
    JWKS: v.string(),
  },
});

app.use(auth, {
  env: {
    JWT_PRIVATE_KEY: app.env.JWT_PRIVATE_KEY,
    JWKS: app.env.JWKS,
  },
});

app.use(organizations, {
  env: {
    JWT_PRIVATE_KEY: app.env.JWT_PRIVATE_KEY,
    JWKS: app.env.JWKS,
  },
});

app.use(staticHosting);

export default app;
