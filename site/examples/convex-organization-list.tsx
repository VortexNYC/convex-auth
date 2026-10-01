import { ConvexOrganizationList } from "../../packages/auth/src/react/organization-list";
import { MOCK_ORGANIZATIONS, MOCK_ORG_INVITATIONS } from "./_shared";

export default function OrganizationListPreview() {
  return (
    <ConvexOrganizationList
      organizations={MOCK_ORGANIZATIONS}
      invitations={MOCK_ORG_INVITATIONS}
      currentOrganizationId="o1"
      onSelectOrganization={() => {}}
      onAcceptInvitation={() => {}}
      onRejectInvitation={() => {}}
      onCreateOrganization={() => {}}
    />
  );
}
