import { createStart } from "@tanstack/react-start";
import { convexAuthRequestMiddleware } from "@vortex-api/convex-auth/tanstack-start/server";
import { api } from "../convex/_generated/api";

export const startInstance = createStart(() => ({
  requestMiddleware: [convexAuthRequestMiddleware({ actions: api.auth })],
}));
