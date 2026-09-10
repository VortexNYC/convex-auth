import { useSession } from "@vortex-api/convex-auth/react";
import { AuthView } from "./AuthView";
import { SignedInView } from "./SignedInView";

export default function App() {
  const { isLoading, isAuthenticated } = useSession();

  if (isLoading) {
    return (
      <div className="bg-background text-foreground flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  return isAuthenticated ? <SignedInView /> : <AuthView />;
}
