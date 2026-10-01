import { ConvexAuthClientSignInScreen } from "../../packages/auth/src/react/convex-auth-client-screens";
import { mockAuthClient } from "./_shared";

export default function ClientSignInScreenPreview() {
  return (
    <ConvexAuthClientSignInScreen
      authClient={mockAuthClient}
      signUpUrl="/sign-up"
      forceRedirectUrl="/dashboard"
      forgotPasswordHref="/forgot-password"
      socialProviders={[{ provider: "google", label: "Google" }]}
    />
  );
}
