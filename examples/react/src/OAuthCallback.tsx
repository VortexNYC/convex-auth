import { useEffect, useMemo, useState } from "react";

type ExchangeResult = {
  token: Record<string, unknown>;
  userinfo: Record<string, unknown>;
};

const exchangesByCode = new Map<string, Promise<ExchangeResult>>();

function exchangeCodeForTokens(
  siteUrl: string,
  code: string,
  redirectUri: string,
  verifier: string,
) {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", redirectUri);
  body.set("client_id", "demo");
  body.set("code_verifier", verifier);

  return fetch(new URL("/oauth/token", siteUrl).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }).then(async (res) => {
    const token = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(`Token exchange failed: ${String(token.error ?? res.status)}`);
    }
    const accessToken = token.access_token as string | undefined;
    if (!accessToken) {
      throw new Error("No access token returned.");
    }
    const userinfo = (await fetch(new URL("/oauth/userinfo", siteUrl).toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then((r) => r.json())) as Record<string, unknown>;
    return { token, userinfo };
  });
}

export function OAuthCallback() {
  const siteUrl = useMemo(() => import.meta.env.VITE_CONVEX_SITE_URL ?? window.location.origin, []);
  const [status, setStatus] = useState("Exchanging code for tokens…");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");
    const expectedState = sessionStorage.getItem("oidc:state");
    const verifier = sessionStorage.getItem("oidc:verifier");
    const redirectUri = sessionStorage.getItem("oidc:redirectUri");

    if (error) {
      setStatus(`Authorization error: ${error} — ${params.get("error_description") ?? ""}`);
      return;
    }

    if (!code || !verifier || !redirectUri) {
      setStatus("Missing authorization code or PKCE verifier.");
      return;
    }

    if (state !== expectedState) {
      setStatus("State mismatch. Possible CSRF attack.");
      return;
    }

    if (!exchangesByCode.has(code)) {
      exchangesByCode.set(code, exchangeCodeForTokens(siteUrl, code, redirectUri, verifier));
    }

    exchangesByCode
      .get(code)!
      .then(({ token, userinfo }) => {
        setStatus("OIDC flow completed.");
        setResult({ token, userinfo });
      })
      .catch((err) => {
        setStatus(err instanceof Error ? err.message : String(err));
      });
  }, [siteUrl]);

  return (
    <div className="bg-background text-foreground flex min-h-screen items-center justify-center p-6">
      <div className="border-border w-full max-w-2xl rounded-2xl border p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">OIDC Callback</h1>
        <p className="text-muted-foreground mt-2 text-sm">{status}</p>
        {result ? (
          <pre className="bg-muted mt-6 max-h-96 overflow-auto rounded-lg p-4 text-xs">
            {JSON.stringify(result, null, 2)}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
