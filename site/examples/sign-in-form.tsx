import { AuthSignInForm } from "@vortex-api/convex-auth/react";

export default function SignInFormPreview() {
  return (
    <AuthSignInForm
      providers={[
        { id: "google", label: "Continue with Google" },
        { id: "github", label: "Continue with GitHub" },
        { id: "discord", label: "Continue with Discord" },
      ]}
      onProviderSelect={() => {}}
      onSubmit={() => {}}
      forgotPasswordHref="#"
    />
  );
}
