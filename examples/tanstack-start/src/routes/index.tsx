import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { auth } = Route.useRouteContext();

  return (
    <main
      style={{ fontFamily: "system-ui", maxWidth: 640, margin: "4rem auto", padding: "0 1rem" }}
    >
      <h1>convex-auth + TanStack Start</h1>
      <p>SSR auth demo — HttpOnly cookies, verified sessions, revocation-aware checks.</p>
      {auth.isAuthenticated ? (
        <p>
          Signed in as <strong>{auth.user?.name ?? auth.user?.email}</strong>.{" "}
          <Link to="/dashboard">Go to dashboard →</Link>
        </p>
      ) : (
        <p>
          Not signed in.{" "}
          <Link to="/sign-in" search={{ redirect: "/dashboard" }}>
            Sign in →
          </Link>
        </p>
      )}
    </main>
  );
}
