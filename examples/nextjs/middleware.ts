import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@vortex-api/convex-auth/nextjs/server";
import { api } from "./convex/_generated/api";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

export default convexAuthNextjsMiddleware(
  async (request, ctx) => {
    // Cheap pre-filter: no Convex call if the session cookie is absent.
    if (isProtectedRoute(request)) {
      const { hasSessionCookie } = ctx.convexAuth.cookieState();
      if (!hasSessionCookie) {
        return nextjsMiddlewareRedirect(request, "/sign-in");
      }
      // Verified check (revocation-aware) for the protected route.
      if (!(await ctx.convexAuth.isAuthenticated())) {
        return nextjsMiddlewareRedirect(request, "/sign-in");
      }
    }
  },
  { actions: api.auth },
);

export const config = {
  // Skip static assets and the auth proxy route itself.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
