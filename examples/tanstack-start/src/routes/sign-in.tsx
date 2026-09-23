import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useConvexAuthClient, useSession } from "@vortex-api/convex-auth/react";

// Keep search params + hash (location.href) but reject open redirects.
// Prefix checks are insufficient: WHATWG normalizes `/\evil.com` and control
// characters into cross-origin URLs. Parse against a dummy origin instead.
function localHref(raw: string, fallback = "/dashboard"): string {
  try {
    const origin = "https://local.invalid";
    const url = new URL(raw, origin);
    if (url.origin !== origin) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search: Record<string, unknown>) => {
    const raw = typeof search.redirect === "string" ? search.redirect : "/dashboard";
    return { redirect: localHref(raw) };
  },
  beforeLoad: ({ context, search }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ href: search.redirect });
    }
  },
  component: SignInPage,
});

function SignInPage() {
  const authClient = useConvexAuthClient();
  const { isLoading } = useSession();
  const router = useRouter();
  const { redirect: redirectTo } = Route.useSearch();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const afterAuth = async () => {
    // Re-run beforeLoad/loaders so route context picks up the fresh session.
    await router.invalidate();
    await router.navigate({ href: redirectTo });
  };

  const submitEmail = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "");

    const result =
      mode === "sign-in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name });

    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Authentication failed");
      return;
    }
    await afterAuth();
  };

  const signInAnonymous = async () => {
    setPending(true);
    setError(null);
    const result = await authClient.signIn.anonymous();
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Anonymous sign-in failed");
      return;
    }
    await afterAuth();
  };

  if (isLoading) return <p>Loading…</p>;

  return (
    <main
      style={{ fontFamily: "system-ui", maxWidth: 420, margin: "4rem auto", padding: "0 1rem" }}
    >
      <h1>{mode === "sign-in" ? "Sign in" : "Sign up"}</h1>
      <form onSubmit={submitEmail} style={{ display: "grid", gap: 8 }}>
        {mode === "sign-up" && <input name="name" placeholder="Name" autoComplete="name" />}
        <input name="email" type="email" placeholder="Email" required autoComplete="email" />
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
        />
        <button type="submit" disabled={pending}>
          {pending ? "…" : mode === "sign-in" ? "Sign in" : "Create account"}
        </button>
      </form>
      <p>
        {mode === "sign-in" ? "No account?" : "Have an account?"}{" "}
        <button
          type="button"
          onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
          style={{ textDecoration: "underline" }}
        >
          {mode === "sign-in" ? "Sign up" : "Sign in"}
        </button>
      </p>
      <hr />
      <button type="button" onClick={signInAnonymous} disabled={pending}>
        Continue anonymously
      </button>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </main>
  );
}
