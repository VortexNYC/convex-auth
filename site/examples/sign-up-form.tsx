// Docs builds run before package builds, so previews import the component
// source rather than the @vortex-api/convex-auth dist exports.
import { AuthSignUpForm } from "../../packages/auth/src/react/auth-forms";

export default function SignUpFormPreview() {
  return (
    <AuthSignUpForm
      providers={[{ id: "google", label: "Google" }]}
      onProviderSelect={() => {}}
      onSubmit={() => {}}
    />
  );
}
