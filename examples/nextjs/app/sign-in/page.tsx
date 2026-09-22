"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useConvexAuthClient, usePasskeys, useSession } from "@vortex-api/convex-auth/react";

type Mode = "signIn" | "signUp" | "twoFactor";

const providers = [
  { id: "github", label: "GitHub" },
  { id: "google", label: "Google" },
  { id: "discord", label: "Discord" },
];

export default function SignInPage() {
  const authClient = useConvexAuthClient();
  const router = useRouter();
  const { isAuthenticated } = useSession();
  const [mode, setMode] = useState<Mode>("signIn");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const finish = () => {
    // The session already landed in HttpOnly cookies via the proxy; the
    // client provider saw the transition and invalidated the Router Cache.
    router.push("/dashboard");
    router.refresh();
  };

  const onCredentialSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    try {
      if (mode === "signUp") {
        const result = await authClient.signUp.email({
          name: String(data.get("name") ?? ""),
          email,
          password,
        });
        if (result.error) {
          setError(result.error.message ?? "Sign up failed");
          return;
        }
        finish();
        return;
      }
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? "Sign in failed");
        return;
      }
      if (result.data?.twoFactorRedirect) {
        setMode("twoFactor");
        return;
      }
      finish();
    } finally {
      setPending(false);
    }
  };

  const onTwoFactorSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const code = String(new FormData(e.currentTarget).get("code") ?? "");
    try {
      // Cookie mode: the pending challenge token lives in an HttpOnly
      // cookie — the proxy substitutes it, we never see it.
      const result = await authClient.twoFactor.verifyTotp({ code });
      if (result.error) {
        setError(result.error.message ?? "Verification failed");
        return;
      }
      finish();
    } finally {
      setPending(false);
    }
  };

  const startOAuth = async (provider: string) => {
    setError(null);
    const result = await authClient.signIn.social({
      provider,
      callbackURL: window.location.origin,
    });
    if (result.error) {
      setError(result.error.message ?? "OAuth sign-in failed");
      return;
    }
    if (result.data?.url) {
      window.location.href = result.data.url;
    }
  };

  const signInGuest = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await authClient.signIn.anonymous();
      if (result.error) {
        setError(result.error.message ?? "Guest sign-in failed");
        return;
      }
      finish();
    } finally {
      setPending(false);
    }
  };

  if (isAuthenticated) {
    return (
      <main>
        <div className="card">
          <p>Already signed in.</p>
          <div className="row">
            <a className="button" href="/dashboard">
              Go to dashboard
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <h1>Sign in</h1>

      {mode === "twoFactor" ? (
        <div className="card">
          <h2>Two-factor verification</h2>
          <p className="muted">
            The pending challenge lives in an HttpOnly cookie — this form never sees a token.
          </p>
          <form onSubmit={onTwoFactorSubmit} className="stack">
            <div>
              <label htmlFor="code">Authenticator code</label>
              <input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
            </div>
            <button type="submit" disabled={pending}>
              Verify
            </button>
          </form>
        </div>
      ) : (
        <div className="card">
          <form onSubmit={onCredentialSubmit} className="stack">
            {mode === "signUp" && (
              <div>
                <label htmlFor="name">Name</label>
                <input id="name" name="name" autoComplete="name" required />
              </div>
            )}
            <div>
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={mode === "signUp" ? "new-password" : "current-password"}
                required
              />
            </div>
            <button type="submit" disabled={pending}>
              {mode === "signUp" ? "Create account" : "Sign in"}
            </button>
          </form>
          <p className="muted">
            {mode === "signUp" ? (
              <>
                Have an account?{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setMode("signIn");
                  }}
                >
                  Sign in
                </a>
              </>
            ) : (
              <>
                No account?{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setMode("signUp");
                  }}
                >
                  Create one
                </a>
              </>
            )}
          </p>
        </div>
      )}

      {mode !== "twoFactor" && (
        <>
          <div className="card">
            <h2>OAuth</h2>
            <div className="stack">
              {providers.map((p) => (
                <button key={p.id} className="secondary" onClick={() => void startOAuth(p.id)}>
                  Continue with {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <h2>Other</h2>
            <div className="stack">
              <button className="secondary" onClick={() => void signInGuest()} disabled={pending}>
                Continue as guest
              </button>
              <PasskeyButton onTwoFactor={() => setMode("twoFactor")} onDone={finish} />
            </div>
          </div>
        </>
      )}

      {error && <p className="error">{error}</p>}
    </main>
  );
}

function PasskeyButton(props: { onTwoFactor: () => void; onDone: () => void }) {
  const { signIn, loading, error, supported } = usePasskeys({});
  if (!supported) return null;
  return (
    <>
      <button
        className="secondary"
        disabled={loading}
        onClick={() =>
          void signIn().then((result) => {
            if (result?.twoFactorRedirect) {
              props.onTwoFactor();
            } else if (result?.token) {
              props.onDone();
            }
          })
        }
      >
        Sign in with passkey
      </button>
      {error && <p className="error">{error}</p>}
    </>
  );
}
