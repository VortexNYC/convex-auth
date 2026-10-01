import { AuthSignedInBoundary } from "../../packages/auth/src/react/auth-client-boundaries";
import { PreviewVariant, PreviewNote } from "./_shared";

export default function SignedInBoundaryPreview() {
  return (
    <>
      <PreviewVariant label="signed in">
        <AuthSignedInBoundary auth={{ isLoaded: true, isSignedIn: true }}>
          <p className="text-sm">Only visible to signed-in users.</p>
        </AuthSignedInBoundary>
      </PreviewVariant>
      <PreviewVariant label="signed out">
        <AuthSignedInBoundary auth={{ isLoaded: true, isSignedIn: false }}>
          <p className="text-sm">Hidden content.</p>
        </AuthSignedInBoundary>
        <PreviewNote>renders nothing — the visitor is signed out</PreviewNote>
      </PreviewVariant>
    </>
  );
}
