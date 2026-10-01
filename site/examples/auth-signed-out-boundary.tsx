import { AuthSignedOutBoundary } from "../../packages/auth/src/react/auth-client-boundaries";

export default function SignedOutBoundaryPreview() {
  return (
    <AuthSignedOutBoundary auth={{ isLoaded: true, isSignedIn: false }}>
      <p>Only visible to signed-out visitors.</p>
    </AuthSignedOutBoundary>
  );
}
