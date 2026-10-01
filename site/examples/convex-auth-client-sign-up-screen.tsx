import { ConvexAuthClientSignUpScreen } from "../../packages/auth/src/react/convex-auth-client-screens";
import { mockAuthClient } from "./_shared";

export default function ClientSignUpScreenPreview() {
  return (
    <ConvexAuthClientSignUpScreen
      authClient={mockAuthClient}
      signInUrl="/sign-in"
      forceRedirectUrl="/onboarding"
      socialProviders={[{ provider: "google", label: "Google" }]}
    />
  );
}
