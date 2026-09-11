import { useEffect, useMemo } from "react";

function base64urlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const binary = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createPkcePair() {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(64));
  const verifier = base64urlEncode(verifierBytes);
  const challenge = base64urlEncode(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  return { verifier, challenge };
}

const clientId = "demo";
const redirectUri = `${window.location.origin}/oauth/callback`;
const scopes = "openid email profile";

export function OidcProviderTest() {
  const siteUrl = useMemo(() => import.meta.env.VITE_CONVEX_SITE_URL ?? window.location.origin, []);

  useEffect(() => {
    sessionStorage.removeItem("oidc:exchanged");
    void createPkcePair().then(({ verifier, challenge }) => {
      const state = base64urlEncode(crypto.getRandomValues(new Uint8Array(16)));
      sessionStorage.setItem("oidc:verifier", verifier);
      sessionStorage.setItem("oidc:state", state);
      sessionStorage.setItem("oidc:redirectUri", redirectUri);

      const authorize = new URL("/oauth/authorize", siteUrl);
      authorize.searchParams.set("response_type", "code");
      authorize.searchParams.set("client_id", clientId);
      authorize.searchParams.set("redirect_uri", redirectUri);
      authorize.searchParams.set("scope", scopes);
      authorize.searchParams.set("state", state);
      authorize.searchParams.set("code_challenge", challenge);
      authorize.searchParams.set("code_challenge_method", "S256");

      window.location.href = authorize.toString();
    });
  }, [siteUrl]);

  return (
    <div className="bg-background text-foreground flex min-h-screen items-center justify-center p-6">
      <p className="text-muted-foreground text-sm">Preparing OIDC request…</p>
    </div>
  );
}
