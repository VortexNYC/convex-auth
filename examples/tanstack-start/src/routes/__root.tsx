import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexAuthTanstackStartProvider } from "@vortex-api/convex-auth/tanstack-start";
import { api } from "../../convex/_generated/api";
import { getAuthState } from "../lib/auth-server";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

export const Route = createRootRoute({
  beforeLoad: async () => ({
    auth: await getAuthState(),
  }),
  component: RootComponent,
});

function RootComponent() {
  const { auth } = Route.useRouteContext();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>convex-auth + TanStack Start</title>
        <HeadContent />
      </head>
      <body>
        <ConvexProvider client={convex}>
          <ConvexAuthTanstackStartProvider actions={api.auth} serverState={auth}>
            <Outlet />
          </ConvexAuthTanstackStartProvider>
        </ConvexProvider>
        <Scripts />
      </body>
    </html>
  );
}
