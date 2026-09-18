import Link from "next/link";
import { convexAuthNextjsSession } from "@vortex-api/convex-auth/nextjs/server";
import { api } from "../convex/_generated/api";

/**
 * Server-rendered auth state. `convexAuthNextjsSession` runs the
 * revocation-aware `verifySession` query — a revoked session resolves
 * signed-out here even if its JWT hasn't expired yet.
 */
export default async function Home() {
  const session = await convexAuthNextjsSession({ actions: api.auth });

  return (
    <main>
      <h1>convex-auth × Next.js</h1>
      <p className="muted">
        Sessions live in HttpOnly cookies. This page was rendered on the
        server with a revocation-aware session check — no client flash.
      </p>

      <div className="card">
        <h2>Server-verified session</h2>
        {session ? (
          <div className="stack">
            <div>
              <strong>User:</strong>{" "}
              {session.user.name ?? session.user.email ?? session.user.id}
            </div>
            <div>
              <strong>Session ID:</strong>{" "}
              <span className="mono">{session.sessionId}</span>
            </div>
            <div className="row">
              <Link className="button" href="/dashboard">
                Open dashboard
              </Link>
            </div>
          </div>
        ) : (
          <div className="stack">
            <p className="muted">Not signed in.</p>
            <div className="row">
              <Link className="button" href="/sign-in">
                Sign in
              </Link>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2>What this demo exercises</h2>
        <ul>
          <li>Middleware lands OAuth session triples into HttpOnly cookies</li>
          <li>Middleware refreshes near-expiry tokens at the boundary</li>
          <li>Sign-in/up/out POST through the adapter proxy (<code>/api/auth</code>)</li>
          <li>2FA pending challenge stays HttpOnly (never touches JS)</li>
          <li>Server components verify sessions revocation-aware</li>
          <li>Client re-seeds from rotated sessions via serverState</li>
        </ul>
      </div>
    </main>
  );
}
