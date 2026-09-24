import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import {
  getAuthServerState,
  getConvexAuthSession,
} from "@vortex-api/convex-auth/tanstack-start/server";
import { api } from "../../convex/_generated/api";

/**
 * Server-resolved auth state for the root route's `beforeLoad` — seeds the
 * client provider and feeds route guards. Revocation-aware.
 */
export const getAuthState = createServerFn({ method: "GET" }).handler(async () => {
  return await getAuthServerState(getRequest(), { actions: api.auth });
});

/**
 * Verified session for protected loaders/server functions that don't want
 * the full middleware context.
 */
export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  return await getConvexAuthSession(getRequest(), { actions: api.auth });
});
