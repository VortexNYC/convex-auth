import { useAuthActions, useSession, useUser } from "convex-auth/react";

function SignInView() {
  const { signInWithRedirect } = useAuthActions();

  const startOAuth = async (provider: "google" | "github" | "discord") => {
    const { url } = await signInWithRedirect({
      provider,
      callbackURL: window.location.origin,
      errorURL: `${window.location.origin}/auth/error`,
    });
    window.location.href = url;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
      <h1>convex-auth OAuth example</h1>
      <p>Sign in to see the user state, profile, and session handling.</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => startOAuth("google")}>Sign in with Google</button>
        <button onClick={() => startOAuth("github")}>Sign in with GitHub</button>
        <button onClick={() => startOAuth("discord")}>Sign in with Discord</button>
      </div>
    </div>
  );
}

function SignedInView() {
  const { signOut } = useAuthActions();
  const user = useUser();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
      <h1>Signed in</h1>
      <div style={{ textAlign: "center" }}>
        <p><strong>ID:</strong> {user?.id ?? "—"}</p>
        <p><strong>Email:</strong> {user?.email ?? "—"}</p>
        <p><strong>Name:</strong> {user?.name ?? "—"}</p>
      </div>
      <button onClick={() => signOut()}>Sign out</button>
    </div>
  );
}

export default function App() {
  const { isLoading, isAuthenticated } = useSession();

  if (isLoading) {
    return <div style={{ textAlign: "center" }}>Loading…</div>;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
      {isAuthenticated ? <SignedInView /> : <SignInView />}
    </div>
  );
}
