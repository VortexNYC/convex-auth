import { defineComponent } from "convex/server";
import { v } from "convex/values";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import mcpOauth from "@vortex-api/convex-auth/convex.config/mcpOauth";

const component = defineComponent("convexAuth", {
  env: {
    JWT_PRIVATE_KEY: v.string(),
    JWKS: v.string(),
  },
});

component.use(rateLimiter, { name: "rateLimiter" });
component.use(mcpOauth, { name: "mcp" });

export default component;
