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

type OrganizationDoc = {
  _id: string;
  name: string;
  slug: string;
  status: string;
};

function OrganizationsSection() {
  const user = useUser();
  const organizations = useQuery(
    api.organizations.list,
    user ? { userId: user.id } : "skip",
  ) as OrganizationDoc[] | undefined;
  const create = useMutation(api.organizations.create);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    if (!user) return;
    try {
      await create({ userId: user.id, name, slug });
      setName("");
      setSlug("");
      setStatus("Organization created.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to create organization");
    }
  };

  return (
    <div style={{ textAlign: "center" }}>
      <h2>Organizations</h2>
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 8, width: 260, margin: "0 auto" }}>
        <input
          type="text"
          placeholder="Organization name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="Slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          required
        />
        <button type="submit">Create organization</button>
      </form>
      {!organizations ? (
        <p>Loading organizations…</p>
      ) : organizations.length === 0 ? (
        <p>No organizations yet.</p>
      ) : (
        <ul style={{ listStyle: "none", paddingLeft: 0 }}>
          {organizations.map((org) => (
            <li key={org._id}>
              <strong>{org.name}</strong> ({org.slug}) — {org.status}
            </li>
          ))}
        </ul>
      )}
      {status ? <p style={{ color: "#666" }}>{status}</p> : null}
    </div>
  );
}

function ProfileEditSection() {
  const user = useUser();
  const { updateUser } = useAuthActions();
  const [name, setName] = useState(user?.name ?? "");
  const [status, setStatus] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    try {
      await updateUser({ name });
      setStatus("Profile updated.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Update failed");
    }
  };

  return (
    <div style={{ textAlign: "center" }}>
      <h2>Edit profile</h2>
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 8, width: 260, margin: "0 auto" }}>
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit">Update name</button>
      </form>
      {status ? <p style={{ color: "#666" }}>{status}</p> : null}
    </div>
  );
}

function EmailVerificationSection() {
  const user = useUser();
  const { sendEmailVerification, verifyEmail, updateSession } = useAuthActions();
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const onSend = async () => {
    if (!user?.email) return;
    setStatus(null);
    setVerificationToken(null);
    const result = await sendEmailVerification({
      email: user.email,
      callbackURL: window.location.origin,
    });
    if (result.status === "queued" && result.emailId) {
      setVerificationToken(result.emailId);
      setStatus("Verification token issued — paste it below to verify.");
    } else if (result.status === "not_configured") {
      setStatus(`Not configured: ${result.reason}`);
    } else {
      setStatus(`Failed: ${result.reason}`);
    }
  };

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationToken) return;
    setStatus(null);
    try {
      const result = await verifyEmail(verificationToken);
      if (result.success) {
        setStatus("Email verified.");
        await updateSession();
      } else {
        setStatus(`Verification failed: ${result.reason}`);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Verification failed");
    }
  };

  if (user?.emailVerified) {
    return (
      <div style={{ textAlign: "center" }}>
        <h2>Email verification</h2>
        <p style={{ color: "#666" }}>Email verified.</p>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center" }}>
      <h2>Email verification</h2>
      <button onClick={onSend}>Send verification email</button>
      {verificationToken ? (
        <form onSubmit={onVerify} style={{ display: "flex", flexDirection: "column", gap: 8, width: 260, margin: "16px auto 0" }}>
          <p style={{ fontFamily: "monospace", fontSize: 12, wordBreak: "break-all", color: "#666" }}>
            {verificationToken}
          </p>
          <input
            type="text"
            placeholder="Verification token"
            value={verificationToken}
            onChange={(e) => setVerificationToken(e.target.value)}
            required
          />
          <button type="submit">Verify email</button>
        </form>
      ) : null}
      {status ? <p style={{ color: "#666" }}>{status}</p> : null}
    </div>
  );
}

function SessionsSection() {
  const user = useUser();
  const sessions = useQuery(
    api.sessions.list,
    user ? { userId: user.id } : "skip",
  ) as SessionDoc[] | undefined;
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

function VerifyPasswordSection() {
  const { token, verifyPassword } = useAuthActions();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setStatus(null);
    try {
      const result = await verifyPassword({ token, password });
      setStatus(result.success ? "Password verified." : "Password incorrect.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Verification failed");
    }
    setPassword("");
  };

  return (
    <div style={{ textAlign: "center" }}>
      <h2>Verify password</h2>
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 8, width: 260, margin: "0 auto" }}>
        <input
          type="password"
          placeholder="Current password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit">Verify password</button>
      </form>
      {status ? <p style={{ color: "#666" }}>{status}</p> : null}
    </div>
  );
}

function TwoFactorSection() {
  const { token, twoFactor } = useAuthActions();
  const [status, setStatus] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
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
    setStatus("2FA setup started — scan the TOTP URI and enter a code to verify.");
  };

  const onVerify = async () => {
    setStatus(null);
    if (!token) {
      setStatus("Sign in first.");
      return;
    }
    try {
      await twoFactor.verifyTotp({ token, code });
      setStatus("TOTP verified. 2FA is active.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Verification failed.");
    }
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
      {totpURI ? (
        <div style={{ marginTop: 8 }}>
          <input
            type="text"
            placeholder="TOTP code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{ marginRight: 8 }}
          />
          <button onClick={onVerify}>Verify TOTP</button>
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
  const { signIn, signUp, twoFactor, setToken, setRefreshToken, setSessionId } = useAuthActions();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<{
    token: string;
    methods?: string[];
  } | null>(null);
  const [code, setCode] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    try {
      if (challenge) {
        return;
      }
      if (mode === "in") {
        const result = await signIn({ email, password });
        if (result.twoFactorRedirect && result.twoFactorChallengeToken) {
          setChallenge({ token: result.twoFactorChallengeToken, methods: result.twoFactorMethods });
          setStatus("Two-factor authentication required.");
          return;
        }
        setStatus("Signed in.");
      } else {
        await signUp({ email, password, name });
        setStatus("Account created.");
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Auth failed");
    }
  };

  const finishChallenge = async (result: {
    token?: string | null;
    refreshToken?: string;
    sessionId?: string;
  }) => {
    if (result.token) {
      setToken(result.token);
      if (result.refreshToken) setRefreshToken(result.refreshToken);
      if (result.sessionId) setSessionId(result.sessionId);
    }
    setChallenge(null);
    setCode("");
    setStatus("Signed in.");
  };

  const onVerifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    setStatus(null);
    try {
      const result = await twoFactor.verifyTotp({ token: challenge.token, code });
      await finishChallenge(result);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "TOTP verification failed");
    }
  };

  const onVerifyBackupCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    setStatus(null);
    try {
      const result = await twoFactor.verifyBackupCode({ token: challenge.token, code });
      await finishChallenge(result);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Backup code verification failed");
    }
  };

  if (challenge) {
    return (
      <form onSubmit={onVerifyTotp} style={{ display: "flex", flexDirection: "column", gap: 8, width: 260 }}>
        <p>Two-factor code required</p>
        <input
          type="text"
          placeholder="Code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit">Verify TOTP</button>
          <button type="button" onClick={onVerifyBackupCode}>Use backup code</button>
        </div>
        {status ? <p style={{ color: "#666" }}>{status}</p> : null}
      </form>
    );
  }

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

function PasswordResetSection({ onDone }: { onDone: () => void }) {
  const { sendPasswordReset, resetPassword } = useAuthActions();
  const [email, setEmail] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    setResetToken(null);
    const result = await sendPasswordReset({ email, redirectTo: window.location.origin });
    if (result.status === "queued" && result.emailId) {
      setResetToken(result.emailId);
      setStatus("Reset token issued — paste it below and set a new password.");
    } else if (result.status === "not_configured") {
      setStatus(`Not configured: ${result.reason}`);
    } else {
      setStatus(`Failed: ${result.reason}`);
    }
  };

  const onReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetToken) return;
    setStatus(null);
    const result = await resetPassword({ token: resetToken, newPassword });
    if (result.status) {
      setStatus("Password reset. Sign in with your new password.");
      setEmail("");
      setNewPassword("");
      onDone();
    } else {
      setStatus(`Reset failed: ${result.reason}`);
    }
  };

  if (!resetToken) {
    return (
      <form onSubmit={onSend} style={{ display: "flex", flexDirection: "column", gap: 8, width: 260 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button type="submit">Send reset email</button>
        {status ? <p style={{ color: "#666" }}>{status}</p> : null}
      </form>
    );
  }

  return (
    <form onSubmit={onReset} style={{ display: "flex", flexDirection: "column", gap: 8, width: 260 }}>
      <p style={{ fontFamily: "monospace", fontSize: 12, wordBreak: "break-all", color: "#666" }}>
        {resetToken}
      </p>
      <input
        type="password"
        placeholder="New password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        required
      />
      <button type="submit">Reset password</button>
      <button type="button" onClick={onDone}>Back to sign in</button>
      {status ? <p style={{ color: "#666" }}>{status}</p> : null}
    </form>
  );
}

function SignInView() {
  const { signInWithRedirect } = useAuthActions();
  const [showReset, setShowReset] = useState(false);

  const startOAuth = async (provider: "google" | "github" | "discord") => {
    const { url } = await signInWithRedirect({
      provider,
      callbackURL: window.location.origin,
      errorURL: `${window.location.origin}/auth/error`,
    });
    window.location.href = url;
  };

  if (showReset) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
        <h1>Reset password</h1>
        <PasswordResetSection onDone={() => setShowReset(false)} />
        <button type="button" onClick={() => setShowReset(false)}>Back to sign in</button>
      </div>
    );
  }

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
      <button type="button" onClick={() => setShowReset(true)}>Forgot password?</button>
    </div>
  );
}

function SignedInView() {
  const { signOut, updateSession } = useAuthActions();
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
      <h1>Signed in</h1>
      <div style={{ textAlign: "center" }}>
        <h2>User</h2>
        <p><strong>ID:</strong> {user?.id ?? "—"}</p>
        <p><strong>Email:</strong> {user?.email ?? "—"}</p>
        <p><strong>Name:</strong> {user?.name ?? "—"}</p>
        <p><strong>Verified:</strong> {user?.emailVerified ? "yes" : "no"}</p>
        <p><strong>2FA enabled:</strong> {user?.twoFactorEnabled ? "yes" : "no"}</p>
        <p><strong>Joined:</strong> {user?.createdAt ? new Date(user.createdAt).toLocaleString() : "—"}</p>
      </div>
      <div style={{ textAlign: "center" }}>
        <h2>Session</h2>
        <p style={{ fontFamily: "monospace", fontSize: 12, maxWidth: 320, wordBreak: "break-all" }}>
          {sessionId ?? "—"}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button onClick={onRefresh}>Refresh session</button>
          <button onClick={() => signOut()}>Sign out</button>
        </div>
      </div>
      <ProfileEditSection />
      <EmailVerificationSection />
      <SessionsSection />
      <TwoFactorSection />
      <VerifyPasswordSection />
      <OrganizationsSection />
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
