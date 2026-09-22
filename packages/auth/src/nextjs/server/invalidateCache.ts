"use server";

import { cookies } from "next/headers";

export async function invalidateAuthRouterCache() {
  // Dummy cookie — setting any cookie header invalidates the Next.js client
  // Router Cache so server components re-render with fresh auth state.
  (await cookies()).delete(`__convexAuthCookieForRouterCacheInvalidation${Date.now()}`);
  return null;
}
