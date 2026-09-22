import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { convexAuthFunctionMiddleware } from "@vortex-api/convex-auth/tanstack-start/server";
import { useConvexAuthClient } from "@vortex-api/convex-auth/react";
import { api } from "../../../convex/_generated/api";

/**
 * Protected server function — `convexAuthFunctionMiddleware` attaches the
 * revocation-aware verified session to `context.session`. This is the
 * security boundary; the `_authed` beforeLoad guard is only UX.
 */
const getDashboardData = createServerFn({ method: "GET" })
  .middleware([convexAuthFunctionMiddleware({ actions: api.auth })])
  .handler(async ({ context }) => {
    const session = context.session;
    if (session === null) {
      throw new Error("Unauthorized");
    }
    return {
      user: session.user,
      sessionId: session.sessionId,
      verifiedAt: new Date().toISOString(),
    };
  });

export const Route = createFileRoute("/_authed/dashboard")({
  loader: () => getDashboardData(),
  component: DashboardPage,
});

function DashboardPage() {
  const data = Route.useLoaderData();
  const authClient = useConvexAuthClient();
  const router = useRouter();

  const signOut = async () => {
    await authClient.signOut();
    await router.invalidate();
    await router.navigate({ to: "/" });
  };

  return (
    <main
      style={{ fontFamily: "system-ui", maxWidth: 640, margin: "4rem auto", padding: "0 1rem" }}
    >
      <h1>Dashboard</h1>
      <p>
        Server-verified session for <strong>{data.user?.name ?? data.user?.email}</strong>
      </p>
      <dl>
        <dt>Session ID</dt>
        <dd>
          <code>{data.sessionId}</code>
        </dd>
        <dt>Verified at</dt>
        <dd>
          <code>{data.verifiedAt}</code>
        </dd>
      </dl>
      <p>
        This loader ran inside <code>createServerFn</code> with{" "}
        <code>convexAuthFunctionMiddleware</code> — the session was re-verified against Convex,
        including revocation.
      </p>
      <button type="button" onClick={signOut}>
        Sign out
      </button>
    </main>
  );
}
