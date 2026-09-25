// Docs builds run before package builds, so previews import the component
// source rather than the @vortex-api/convex-auth dist exports.
import { AuthSignInForm } from "../../packages/auth/src/react/auth-forms";

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
