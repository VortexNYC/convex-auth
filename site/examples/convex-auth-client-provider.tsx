import { ConvexAuthClientProvider } from "../../packages/auth/src/react/convex-auth-client-provider";
import { ConvexPreviewShell, mockAuthActions } from "./_shared";

export default function AuthClientProviderPreview() {
  return (
    <ConvexPreviewShell>
      <ConvexAuthClientProvider actions={mockAuthActions} storage="session">
        <p>Subtree with auth client context available.</p>
      </ConvexAuthClientProvider>
    </ConvexPreviewShell>
  );
}
