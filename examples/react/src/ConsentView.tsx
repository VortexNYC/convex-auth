import { useAuthActions } from "@vortex-api/convex-auth/react";
import { useMemo } from "react";

export function ConsentView() {
  const { token } = useAuthActions();
  const pageParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const redirectTo = pageParams.get("redirect_to");
  const requestUrl = useMemo(() => {
    try {
      return redirectTo ? new URL(redirectTo) : new URL(window.location.href);
    } catch {
      return new URL(window.location.href);
    }
  }, [redirectTo]);
  const params = requestUrl.searchParams;

  const clientId = params.get("client_id") ?? "unknown client";
  const scope = params.get("scope") ?? "openid";
  const redirectUri = params.get("redirect_uri") ?? "";
  const state = params.get("state");

  const scopes = scope.split(" ").filter(Boolean);

  const handleApprove = () => {
    if (token) {
      // Make the native access token available as a cookie so the OIDC
      // provider authorize endpoint can resolve the signed-in session during
      // the top-level redirect.
      document.cookie = `convex-auth-token=${encodeURIComponent(token)};path=/;SameSite=Lax`;
    }
    const approved = new URL(requestUrl.toString());
    approved.searchParams.set("consent_approved", "true");
    window.location.href = approved.toString();
  };

  const handleDeny = () => {
    if (redirectUri) {
      const deny = new URL(redirectUri);
      deny.searchParams.set("error", "access_denied");
      deny.searchParams.set("error_description", "User denied access");
      if (state) deny.searchParams.set("state", state);
      window.location.href = deny.toString();
    } else {
      window.history.back();
    }
  };

  return (
    <div className="bg-background text-foreground flex min-h-screen items-center justify-center p-6">
      <div className="border-border w-full max-w-md rounded-2xl border p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Authorize {clientId}</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          The application <strong className="text-foreground">{clientId}</strong> is requesting
          access to your account.
        </p>

        <div className="mt-6 space-y-3">
          <h2 className="text-sm font-medium">Requested scopes</h2>
          <ul className="border-border divide-border divide-y rounded-lg border">
            {scopes.map((s) => (
              <li key={s} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium">
                  {s}
                </span>
                <span className="text-muted-foreground capitalize">{s.replace(/_/g, " ")}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={handleDeny}
            className="border-border text-foreground hover:bg-muted flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors"
          >
            Deny
          </button>
          <button
            type="button"
            onClick={handleApprove}
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
