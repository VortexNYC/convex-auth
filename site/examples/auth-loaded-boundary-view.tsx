import { AuthLoadedBoundaryView } from "../../packages/auth/src/react/auth-client-boundaries";
import { PreviewVariant, PreviewNote } from "./_shared";

export default function LoadedBoundaryPreview() {
  return (
    <>
      <PreviewVariant label="loaded">
        <AuthLoadedBoundaryView auth={{ isLoaded: true, isSignedIn: true }}>
          <p className="text-sm">Shown once auth state has resolved.</p>
        </AuthLoadedBoundaryView>
      </PreviewVariant>
      <PreviewVariant label="loading">
        <AuthLoadedBoundaryView auth={{ isLoaded: false, isSignedIn: false }}>
          <p className="text-sm">Hidden content.</p>
        </AuthLoadedBoundaryView>
        <PreviewNote>renders nothing while auth is still resolving</PreviewNote>
      </PreviewVariant>
    </>
  );
}
