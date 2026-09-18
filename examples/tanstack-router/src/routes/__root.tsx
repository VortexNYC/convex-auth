import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import type { RouterAuthContext } from "../router";

export const Route = createRootRouteWithContext<RouterAuthContext>()({
  component: () => (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-foreground/10 border-b px-6 py-4">
        <nav className="mx-auto flex max-w-3xl items-center gap-4 text-sm">
          <Link to="/" className="font-semibold">
            convex-auth + TanStack Router
          </Link>
          <Link to="/dashboard" className="hover:underline">
            Dashboard
          </Link>
          <Link to="/sign-in" className="hover:underline">
            Sign in
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  ),
});
