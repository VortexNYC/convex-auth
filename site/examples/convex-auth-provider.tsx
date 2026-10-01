import { ConvexAuthProvider } from "../../packages/auth/src/react/ConvexAuthProvider";
import { ConvexPreviewShell, mockAuthActions } from "./_shared";

export default function AuthProviderPreview() {
  return (
    <ConvexPreviewShell>
      <ConvexAuthProvider actions={mockAuthActions} storage="session">
        <p>Subtree wrapped by the native auth provider.</p>
      </ConvexAuthProvider>
    </ConvexPreviewShell>
  );
}
