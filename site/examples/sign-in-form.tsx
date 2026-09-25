import { AuthSignInForm } from "@vortex-api/convex-auth/react";

export default function SignInFormPreview() {
  return (
    <AuthSignInForm
      providers={[
        { id: "google", label: "Google" },
        { id: "github", label: "GitHub" },
        { id: "discord", label: "Discord" },
      ]}
      onProviderSelect={() => {}}
      onSubmit={() => {}}
      forgotPasswordHref="#"
    />
  );
}
