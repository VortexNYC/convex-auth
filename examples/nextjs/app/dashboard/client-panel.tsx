"use client";

import { useSession } from "@vortex-api/convex-auth/react";

/**
 * Client view of the same session. On first paint this should already be
 * authenticated — the server provider seeded the verified user, and the
 * live verifySession query keeps it fresh (re-seeding on rotation).
 */
export function ClientSessionPanel() {
  const { user, sessionId, isLoading, isAuthenticated } = useSession();

  return (
    <div className="card">
      <h2>Client side (useSession)</h2>
      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : isAuthenticated && user ? (
        <div className="stack">
          <div>
            <strong>User:</strong> {user.name ?? user.email ?? user.id}
          </div>
          <div>
            <strong>Session ID:</strong> <span className="mono">{sessionId}</span>
          </div>
          <div>
            <strong>2FA:</strong> {user.twoFactorEnabled ? "enabled" : "off"}
          </div>
        </div>
      ) : (
        <p className="muted">Not authenticated on the client.</p>
      )}
    </div>
  );
}
