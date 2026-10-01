import { AuthLoadingBoundaryView } from "../../packages/auth/src/react/auth-client-boundaries";
import { PreviewVariant, PreviewNote } from "./_shared";

export default function LoadingBoundaryPreview() {
  return (
    <>
      <PreviewVariant label="loading">
        <AuthLoadingBoundaryView auth={{ isLoaded: false, isSignedIn: false }}>
          <p className="text-sm">Shown while auth state resolves.</p>
        </AuthLoadingBoundaryView>
      </PreviewVariant>
      <PreviewVariant label="loaded">
        <AuthLoadingBoundaryView auth={{ isLoaded: true, isSignedIn: true }}>
          <p className="text-sm">Hidden content.</p>
        </AuthLoadingBoundaryView>
        <PreviewNote>renders nothing once auth has resolved</PreviewNote>
      </PreviewVariant>
    </>
  );
}
