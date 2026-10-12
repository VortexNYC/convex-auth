import { ConvexOrganizationList } from "../../../packages/auth/src/react-native/organization-list";

export default function OrganizationListPreview() {
  return (
    <ConvexOrganizationList
      currentOrganizationId="org_acme"
      organizations={[
        { _id: "org_acme", name: "Acme Inc.", roleKey: "owner" },
        { _id: "org_beta", name: "Beta Labs", roleKey: "admin" },
      ]}
      showInvitations
      invitations={[
        {
          _id: "inv_1",
          organizationName: "Gamma Works",
          roleKey: "member",
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        },
      ]}
      onSelectOrganization={() => {}}
      onAcceptInvitation={() => {}}
      onRejectInvitation={() => {}}
      onCreateOrganization={() => {}}
    />
  );
}
