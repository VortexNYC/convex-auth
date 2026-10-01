import { ConvexAuthSignInPage } from "../../packages/auth/src/react/auth-pages";
import { mockAuthClient } from "./_shared";

export default function AuthSignInPagePreview() {
  return (
    <ConvexAuthSignInPage
      auth={{ isLoaded: true, isSignedIn: false }}
      authClient={mockAuthClient}
      signUpUrl="/sign-up"
      forceRedirectUrl="/dashboard"
      forgotPasswordHref="/forgot-password"
      socialProviders={[
        { provider: "google", label: "Google" },
        { provider: "github", label: "GitHub" },
      ]}
    />
  );
}
