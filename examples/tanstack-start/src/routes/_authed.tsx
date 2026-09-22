import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context, location }) => {
    // UX guard only — the middleware + verified checks are the security
    // boundary. `context.auth` was resolved by the root route's beforeLoad.
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: "/sign-in",
        search: { redirect: location.href },
      });
    }
  },
  component: () => <Outlet />,
});
