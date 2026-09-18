import { redirect } from "next/navigation";
import {
  convexAuthNextjsSession,
  convexAuthNextjsToken,
} from "@vortex-api/convex-auth/nextjs/server";
import { api } from "../../convex/_generated/api";
import { ClientSessionPanel } from "./client-panel";
import { SignOutButton } from "./sign-out-button";

/**
 * Protected page — the middleware matcher already verified the session,
 * and this page verifies again revocation-aware before rendering.
 * `convexAuthNextjsSession` is React-cache() memoized per render pass.
 */
export default async function DashboardPage() {
  const session = await convexAuthNextjsSession({ actions: api.auth });
  if (!session) {
    redirect("/sign-in");
  }

  // Raw access token for authenticated fetchQuery/fetchAction calls.
  const token = await convexAuthNextjsToken();

  return (
    <main>
      <h1>Dashboard</h1>
      <p className="muted">
        Server-verified render — a revoked session redirects even with a
        live JWT.
      </p>

      <div className="card">
        <h2>Server side</h2>
        <div className="stack">
          <div>
            <strong>User:</strong>{" "}
            {session.user.name ?? session.user.email ?? session.user.id}
          </div>
          <div>
            <strong>Email verified:</strong>{" "}
            {session.user.emailVerified ? "yes" : "no"}
          </div>
          <div>
            <strong>Session ID:</strong>{" "}
            <span className="mono">{session.sessionId}</span>
          </div>
          <div>
            <strong>Access token:</strong>{" "}
            <span className="mono">
              {token ? `${token.slice(0, 24)}…` : "none"}
            </span>
          </div>
        </div>
      </div>

      <ClientSessionPanel />

      <div className="card">
        <h2>Session</h2>
        <SignOutButton />
      </div>
    </main>
  );
}
