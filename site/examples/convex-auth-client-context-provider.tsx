import { ConvexAuthProvider } from "../../packages/auth/src/react/ConvexAuthProvider";
import { ConvexAuthClientContextProvider } from "../../packages/auth/src/react/convex-auth-client-provider";
import { ConvexPreviewShell, mockAuthActions } from "./_shared";

export default function AuthClientContextProviderPreview() {
  return (
    <ConvexPreviewShell>
      <ConvexAuthProvider actions={mockAuthActions} storage="session">
        <ConvexAuthClientContextProvider>
          <p>useConvexAuthClientContext() resolves inside this subtree.</p>
        </ConvexAuthClientContextProvider>
      </ConvexAuthProvider>
    </ConvexPreviewShell>
  );
}
