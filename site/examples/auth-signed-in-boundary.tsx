import { AuthSignedInBoundary } from "../../packages/auth/src/react/auth-client-boundaries";

export default function SignedInBoundaryPreview() {
  return (
    <AuthSignedInBoundary auth={{ isLoaded: true, isSignedIn: true }}>
      <p>Only visible to signed-in users.</p>
    </AuthSignedInBoundary>
  );
}
