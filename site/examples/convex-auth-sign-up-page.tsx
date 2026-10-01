import { ConvexAuthSignUpPage } from "../../packages/auth/src/react/auth-pages";
import { mockAuthClient } from "./_shared";

export default function AuthSignUpPagePreview() {
  return (
    <ConvexAuthSignUpPage
      auth={{ isLoaded: true, isSignedIn: false }}
      authClient={mockAuthClient}
      signInUrl="/sign-in"
      forceRedirectUrl="/onboarding"
      socialProviders={[
        { provider: "google", label: "Google" },
        { provider: "github", label: "GitHub" },
      ]}
    />
  );
}
