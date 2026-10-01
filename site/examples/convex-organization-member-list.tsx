import { ConvexOrganizationMemberList } from "../../packages/auth/src/react/organization-members";
import { MOCK_MEMBERS, MOCK_ROLE_OPTIONS, PreviewVariant } from "./_shared";

export default function OrganizationMemberListPreview() {
  return (
    <>
      <PreviewVariant label="populated">
        <ConvexOrganizationMemberList
          members={MOCK_MEMBERS}
          copy={{ emptyMessage: "No members yet." }}
          roleOptions={MOCK_ROLE_OPTIONS}
          onRoleChange={() => {}}
          onSuspend={() => {}}
          onReactivate={() => {}}
        />
      </PreviewVariant>
      <PreviewVariant label="empty">
        <ConvexOrganizationMemberList
          members={[]}
          copy={{ emptyMessage: "No members yet." }}
          roleOptions={MOCK_ROLE_OPTIONS}
          onRoleChange={() => {}}
          onSuspend={() => {}}
          onReactivate={() => {}}
        />
      </PreviewVariant>
    </>
  );
}
