import { useSession } from "@vortex-api/convex-auth/react";
import { AuthView } from "./AuthView";
import { ConsentView } from "./ConsentView";
import { OAuthCallback } from "./OAuthCallback";
import { OidcProviderTest } from "./OidcProviderTest";
import { SignedInView } from "./SignedInView";

export default function App() {
  const { isLoading, isAuthenticated } = useSession();

  if (window.location.pathname.startsWith("/oauth/consent")) {
    return <ConsentView />;
  }

  if (window.location.pathname.startsWith("/oauth/callback")) {
    return <OAuthCallback />;
  }

  if (window.location.pathname === "/oidc-provider-test") {
    return <OidcProviderTest />;
  }

  if (isLoading) {
    return (
      <div className="bg-background text-foreground flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  return isAuthenticated ? <SignedInView /> : <AuthView />;
}
