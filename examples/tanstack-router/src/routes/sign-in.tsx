import { createFileRoute, Navigate } from "@tanstack/react-router";
import { ConvexAuthSignInPage, useSession } from "@vortex-api/convex-auth/react";

type SignInSearch = {
  redirect?: string;
};

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search: Record<string, unknown>): SignInSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: SignInPage,
});

function SignInPage() {
  const { isLoading, isAuthenticated } = useSession();
  const { redirect } = Route.useSearch();

  if (isAuthenticated) {
    return <Navigate to={redirect ?? "/dashboard"} />;
  }

  return (
    <ConvexAuthSignInPage
      auth={{ isLoaded: !isLoading, isSignedIn: isAuthenticated }}
      signUpUrl="/sign-in"
      forceRedirectUrl={redirect ?? "/dashboard"}
    />
  );
}
