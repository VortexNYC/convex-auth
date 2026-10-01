import { ConvexAuthIdentityProvisioner } from "../../packages/auth/src/react/auth-client-identity-provisioner";

export default function IdentityProvisionerPreview() {
  // Side-effect component: mounts, provisions the signed-in user on first
  // paint, renders nothing.
  return (
    <div>
      <ConvexAuthIdentityProvisioner
        auth={{ isLoaded: true, isSignedIn: true }}
        currentUser={{ id: "u1" }}
        sessionSubject="u1"
        provisionCurrentUser={async () => {}}
      />
      <p>Provisioner mounted — it provisions the current user, then renders no UI.</p>
    </div>
  );
}
