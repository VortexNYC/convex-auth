import { ConvexAuthConvexIdentityProvisioner } from "../../packages/auth/src/react/convex-auth-app-runtime";
import { ConvexPreviewShell, fnRef } from "./_shared";

export default function ConvexIdentityProvisionerPreview() {
  return (
    <ConvexPreviewShell>
      <ConvexAuthConvexIdentityProvisioner
        auth={{ isLoaded: true, isSignedIn: true }}
        getCurrentUser={fnRef("users:getCurrentUser")}
        provisionCurrentUser={fnRef("users:provisionCurrentUser")}
      />
      <p>Convex provisioner mounted — queries stay pending without a deployment.</p>
    </ConvexPreviewShell>
  );
}
