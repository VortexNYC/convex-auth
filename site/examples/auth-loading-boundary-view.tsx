import { AuthLoadingBoundaryView } from "../../packages/auth/src/react/auth-client-boundaries";

export default function LoadingBoundaryViewPreview() {
  return (
    <AuthLoadingBoundaryView auth={{ isLoaded: false, isSignedIn: false }}>
      <p>Loading auth state…</p>
    </AuthLoadingBoundaryView>
  );
}
