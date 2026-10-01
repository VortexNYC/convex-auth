import { AuthSignedOutBoundary } from "../../packages/auth/src/react/auth-client-boundaries";
import { PreviewVariant, PreviewNote } from "./_shared";

export default function SignedOutBoundaryPreview() {
  return (
    <>
      <PreviewVariant label="signed out">
        <AuthSignedOutBoundary auth={{ isLoaded: true, isSignedIn: false }}>
          <p className="text-sm">Only visible to signed-out visitors.</p>
        </AuthSignedOutBoundary>
      </PreviewVariant>
      <PreviewVariant label="signed in">
        <AuthSignedOutBoundary auth={{ isLoaded: true, isSignedIn: true }}>
          <p className="text-sm">Hidden content.</p>
        </AuthSignedOutBoundary>
        <PreviewNote>renders nothing — the user is signed in</PreviewNote>
      </PreviewVariant>
    </>
  );
}
