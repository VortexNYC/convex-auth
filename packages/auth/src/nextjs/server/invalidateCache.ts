"use server";

import { cookies } from "next/headers";

/**
 * Invalidates the Next.js client Router Cache by setting a dummy cookie —
 * any cookie write forces server components to re-render with fresh auth
 * state.
 */
export async function invalidateAuthRouterCache() {
  (await cookies()).delete(`__convexAuthCookieForRouterCacheInvalidation${Date.now()}`);
  return null;
}
