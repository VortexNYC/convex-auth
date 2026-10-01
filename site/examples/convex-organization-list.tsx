import { ConvexOrganizationList } from "../../packages/auth/src/react/organization-list";
import { MOCK_ORGANIZATIONS, MOCK_ORG_INVITATIONS, PreviewVariant } from "./_shared";

export default function OrganizationListPreview() {
  return (
    <>
      <PreviewVariant label="with invitations">
        <ConvexOrganizationList
          organizations={MOCK_ORGANIZATIONS}
          invitations={MOCK_ORG_INVITATIONS}
          currentOrganizationId="o1"
          onSelectOrganization={() => {}}
          onAcceptInvitation={() => {}}
          onRejectInvitation={() => {}}
          onCreateOrganization={() => {}}
        />
      </PreviewVariant>
      <PreviewVariant label="empty">
        <ConvexOrganizationList
          organizations={[]}
          invitations={[]}
          currentOrganizationId={null}
          onSelectOrganization={() => {}}
          onAcceptInvitation={() => {}}
          onRejectInvitation={() => {}}
          onCreateOrganization={() => {}}
        />
      </PreviewVariant>
    </>
  );
}
