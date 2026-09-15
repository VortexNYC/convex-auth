import { ConvexAdminPortal } from "@vortex-api/convex-auth/react";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../convex/_generated/api";

export function AdminPortalPanel() {
  const [message, setMessage] = useState<string | null>(null);
  const organizations = useQuery(api.organizations.listMyOrganizations) ?? [];
  const invitations = useQuery(api.organizations.listMyInvitations) ?? [];
  const activeOrg = useQuery(api.organizations.getActiveOrganization);
  const setActive = useMutation(api.organizations.setActiveOrganization);
  const redeem = useMutation(api.organizations.redeemInvitation);
  const create = useMutation(api.organizations.createOrganization);

  const currentOrganizationId = activeOrg?._id ?? null;

  return (
    <div className="space-y-4">
      {message ? (
        <div className="bg-muted text-foreground rounded-lg p-3 text-sm" role="status">
          {message}
        </div>
      ) : null}
      <ConvexAdminPortal
        twoFactorIssuer="convex-auth"
        organizations={organizations}
        invitations={invitations}
        currentOrganizationId={currentOrganizationId}
        onSelectOrganization={async (id) => {
          await setActive({ organizationId: id });
          setMessage("Active workspace updated.");
        }}
        onAcceptInvitation={async (id) => {
          try {
            await redeem({ invitationId: id });
            setMessage("Invitation accepted.");
          } catch (err) {
            setMessage(err instanceof Error ? err.message : "Could not accept invitation");
          }
        }}
        onCreateOrganization={async () => {
          try {
            await create({ name: "New workspace" });
            setMessage("Workspace created.");
          } catch (err) {
            setMessage(err instanceof Error ? err.message : "Could not create workspace");
          }
        }}
      />
    </div>
  );
}
