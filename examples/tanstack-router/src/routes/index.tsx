import { createFileRoute, Link } from "@tanstack/react-router";
import { useSession } from "@vortex-api/convex-auth/react";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { isLoading, isAuthenticated } = useSession();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">TanStack Router auth demo</h1>
      <p className="text-foreground/70">
        Client-side auth integration: session state is mirrored into the router context and
        protected routes are guarded in <code>beforeLoad</code>.
      </p>
      {isLoading ? (
        <p>Checking session…</p>
      ) : isAuthenticated ? (
        <Link to="/dashboard" className="bg-foreground text-background rounded-sm px-4 py-2">
          Go to dashboard
        </Link>
      ) : (
        <Link to="/sign-in" className="bg-foreground text-background rounded-sm px-4 py-2">
          Sign in
        </Link>
      )}
    </div>
  );
}
