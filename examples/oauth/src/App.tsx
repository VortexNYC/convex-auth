import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useAuthActions, useSession, useUser } from "convex-auth/react";
import { api } from "../convex/_generated/api";

type SessionDoc = {
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
};

function SessionsSection() {
  const sessions = useQuery(api.sessions.list) as SessionDoc[] | undefined;
  const revoke = useMutation(api.sessions.revoke);
  const [status, setStatus] = useState<string | null>(null);

  const onRevoke = async (sessionId: string) => {
    setStatus(null);
    try {
      await revoke({ sessionId });
      setStatus("Session revoked.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to revoke.");
    }
  };

  return (
    <div style={{ textAlign: "center" }}>
      <h2>Active sessions</h2>
      {!sessions ? (
        <p>Loading sessions…</p>
      ) : sessions.length === 0 ? (
        <p>No active sessions.</p>
      ) : (
        <ul style={{ listStyle: "none", paddingLeft: 0, fontFamily: "monospace", fontSize: 12 }}>
          {sessions.map((s) => (
            <li key={s.sessionId} style={{ marginBottom: 8 }}>
              <div>{s.sessionId}</div>
              <div style={{ color: "#666" }}>
                Created {new Date(s.createdAt).toLocaleString()} · Expires {new Date(s.expiresAt).toLocaleString()}
              </div>
              <button onClick={() => void onRevoke(s.sessionId)}>Revoke</button>
            </li>
          ))}
        </ul>
      )}
      {status ? <p style={{ color: "#666" }}>{status}</p> : null}
    </div>
  );
}

function TwoFactorSection() {
  const { twoFactor } = useAuthActions();
  const [status, setStatus] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [totpURI, setTotpURI] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  const onEnable = async () => {
    setStatus(null);
    const result = await twoFactor.enable({ password });
    if (result.error) {
      setStatus(result.error);
      return;
    }
    setTotpURI(result.totpURI ?? null);
    setBackupCodes(result.backupCodes ?? null);
    setStatus("2FA enabled — scan the TOTP URI and save the backup codes.");
  };

  const onDisable = async () => {
    setStatus(null);
    const result = await twoFactor.disable({ password });
    if (result.success) {
      setTotpURI(null);
      setBackupCodes(null);
      setStatus("2FA disabled.");
    } else {
      setStatus("Failed to disable 2FA.");
    }
  };

  const onRegenerate = async () => {
    setStatus(null);
    const result = await twoFactor.generateBackupCodes();
    setBackupCodes(result.backupCodes ?? null);
    setStatus("Backup codes regenerated.");
  };

  return (
    <div style={{ textAlign: "center" }}>
      <h2>Two-factor authentication</h2>
      <input
        type="password"
        placeholder="Current password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ marginRight: 8 }}
      />
      <button onClick={onEnable}>Enable 2FA</button>
      <button onClick={onDisable}>Disable 2FA</button>
      <button onClick={onRegenerate}>Regenerate backup codes</button>
      {totpURI ? (
        <div style={{ marginTop: 8 }}>
          <p style={{ maxWidth: 320, wordBreak: "break-all", fontFamily: "monospace", fontSize: 12 }}>
            {totpURI}
          </p>
        </div>
      ) : null}
      {backupCodes ? (
        <div style={{ marginTop: 8 }}>
          <p>Backup codes:</p>
          <ul style={{ fontFamily: "monospace", fontSize: 12, paddingLeft: 0, listStyle: "none" }}>
            {backupCodes.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      ) : null}
      {status ? <p style={{ color: "#666" }}>{status}</p> : null}
    </div>
  );
}

function EmailPasswordForm() {
  const { signIn, signUp } = useAuthActions();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    try {
      if (mode === "in") {
        await signIn({ email, password });
      } else {
        await signUp({ email, password, name });
      }
      setStatus("Success — reload if not automatic.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Auth failed");
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: "flex", flexDirection: "column", gap: 8, width: 260 }}
    >
      {mode === "up" ? (
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      ) : null}
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <button type="submit">{mode === "in" ? "Sign in" : "Sign up"}</button>
      <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")}>
        {mode === "in" ? "Create account" : "Already have an account?"}
      </button>
      {status ? <p style={{ color: "#666" }}>{status}</p> : null}
    </form>
  );
}

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
      <p>Sign in to see the user state, profile, sessions, and token refresh.</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => startOAuth("google")}>Sign in with Google</button>
        <button onClick={() => startOAuth("github")}>Sign in with GitHub</button>
        <button onClick={() => startOAuth("discord")}>Sign in with Discord</button>
      </div>
      <div style={{ width: "100%", height: 1, background: "#ccc" }} />
      <EmailPasswordForm />
    </div>
  );
}

function SignedInView() {
  const { signOut, updateSession, sendEmailVerification } = useAuthActions();
  const user = useUser();
  const { sessionId } = useSession();
  const [status, setStatus] = useState<string | null>(null);

  const onRefresh = async () => {
    setStatus("Refreshing…");
    try {
      await updateSession();
      setStatus("Session refreshed.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Refresh failed");
    }
  };

  const onVerify = async () => {
    if (!user?.email) return;
    setStatus("Sending verification email…");
    const result = await sendEmailVerification({
      email: user.email,
      callbackURL: window.location.origin,
    });
    if (result.status === "queued") {
      setStatus("Verification email queued.");
    } else if (result.status === "not_configured") {
      setStatus(`Not configured: ${result.reason}`);
    } else {
      setStatus(`Failed: ${result.reason}`);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
      <h1>Signed in</h1>
      <div style={{ textAlign: "center" }}>
        <h2>User</h2>
        <p>
          <strong>ID:</strong> {user?.id ?? "—"}
        </p>
        <p>
          <strong>Email:</strong> {user?.email ?? "—"}
        </p>
        <p>
          <strong>Name:</strong> {user?.name ?? "—"}
        </p>
        <p>
          <strong>Verified:</strong> {user?.emailVerified ? "yes" : "no"}
        </p>
        <p>
          <strong>Joined:</strong>{" "}
          {user?.createdAt ? new Date(user.createdAt).toLocaleString() : "—"}
        </p>
      </div>
      <div style={{ textAlign: "center" }}>
        <h2>Session</h2>
        <p style={{ fontFamily: "monospace", fontSize: 12, maxWidth: 320, wordBreak: "break-all" }}>
          {sessionId ?? "—"}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button onClick={onRefresh}>Refresh session</button>
          {user?.email && !user.emailVerified ? (
            <button onClick={onVerify}>Send verification email</button>
          ) : null}
          <button onClick={() => signOut()}>Sign out</button>
        </div>
      </div>
      <SessionsSection />
      <TwoFactorSection />
      {status ? <p style={{ color: "#666" }}>{status}</p> : null}
    </div>
  );
}

export default function App() {
  const { isLoading, isAuthenticated } = useSession();

  if (isLoading) {
    return <div style={{ textAlign: "center" }}>Loading…</div>;
  }

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {isAuthenticated ? <SignedInView /> : <SignInView />}
    </div>
  );
}
