import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  ConvexAuthSignOutButton,
  ConvexSessionList,
  useConvexAuthClient,
  useConvexAuthUser,
  usePasskeys,
  useSession,
} from "@vortex-api/convex-auth/react";

export const Route = createFileRoute("/_authed/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const authClient = useConvexAuthClient();
  const { isAuthenticated } = useSession();
  const { user } = useConvexAuthUser(authClient);
  const navigate = useNavigate();

  const handleSignOut = async () => {
    if (authClient) {
      await authClient.signOut();
    }
    await navigate({ to: "/" });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <ConvexAuthSignOutButton signOut={() => void handleSignOut()} />
      </div>

      <p className="text-foreground/70">
        This route is protected by a <code>beforeLoad</code> guard on the <code>_authed</code>{" "}
        layout — unauthenticated visitors are redirected to <code>/sign-in</code> with a{" "}
        <code>?redirect=</code> back to this page.
      </p>

      {isAuthenticated && user && (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Profile</h2>
            <p className="text-sm">{user.primaryEmailAddress?.emailAddress}</p>
          </section>
          <PasskeysPanel userId={user.id} email={user.primaryEmailAddress?.emailAddress ?? ""} />
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Sessions</h2>
            <ConvexSessionList />
          </section>
        </>
      )}
    </div>
  );
}

function PasskeysPanel({ userId, email }: { userId: string; email: string }) {
  const [name, setName] = useState("");
  const { passkeys, register, revoke, rename, loading, error, supported } = usePasskeys({
    userId,
    identifier: email,
  });

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Passkeys</h2>
      <p className="text-foreground/70 text-sm">
        {supported ? "WebAuthn is supported." : "WebAuthn is not supported in this browser."}
      </p>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Passkey name"
          className="border-foreground/15 flex-1 rounded-sm border px-3 py-2 text-sm"
        />
        <button
          onClick={() => void register(name)}
          disabled={!name || loading || !supported}
          className="bg-foreground text-background rounded-sm px-4 py-2 text-sm disabled:opacity-50"
        >
          Register
        </button>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <ul className="space-y-2">
        {passkeys.map((pk) => (
          <li
            key={pk.credentialId}
            className="border-foreground/10 flex items-center justify-between rounded-sm border p-2 text-sm"
          >
            <span>
              {pk.name || "Unnamed"}
              <span className="text-foreground/60"> · {pk.revoked ? "Revoked" : "Active"}</span>
            </span>
            <span className="flex gap-2">
              <button
                className="underline"
                onClick={() => {
                  const next = window.prompt("Rename passkey", pk.name ?? "");
                  if (next?.trim()) {
                    void rename(pk.credentialId, next.trim());
                  }
                }}
              >
                Rename
              </button>
              <button className="underline" onClick={() => void revoke(pk.credentialId)}>
                Revoke
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
