import { ConvexAuthSurface } from "../../packages/auth/src/react/auth-pages";
import { AuthSignInForm } from "../../packages/auth/src/react/auth-forms";

export default function AuthSurfacePreview() {
  return (
    <ConvexAuthSurface title="Sign in" description="Access your workspace.">
      <AuthSignInForm
        providers={[{ id: "google", label: "Google" }]}
        onProviderSelect={() => {}}
        onSubmit={() => {}}
      />
    </ConvexAuthSurface>
  );
}
