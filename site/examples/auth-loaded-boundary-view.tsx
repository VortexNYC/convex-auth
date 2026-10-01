import { AuthLoadedBoundaryView } from "../../packages/auth/src/react/auth-client-boundaries";

export default function LoadedBoundaryViewPreview() {
  return (
    <AuthLoadedBoundaryView auth={{ isLoaded: true, isSignedIn: true }}>
      <p>Rendered once auth state has resolved.</p>
    </AuthLoadedBoundaryView>
  );
}
