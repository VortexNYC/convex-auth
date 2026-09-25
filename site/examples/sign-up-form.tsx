import { AuthSignUpForm } from "@vortex-api/convex-auth/react";

export default function SignUpFormPreview() {
  return (
    <AuthSignUpForm
      providers={[{ id: "google", label: "Google" }]}
      onProviderSelect={() => {}}
      onSubmit={() => {}}
    />
  );
}
