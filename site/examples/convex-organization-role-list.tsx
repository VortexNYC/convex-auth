import { ConvexOrganizationRoleList } from "../../packages/auth/src/react/organization-roles";
import { MOCK_ROLES, PreviewVariant } from "./_shared";

export default function OrganizationRoleListPreview() {
  return (
    <>
      <PreviewVariant label="populated">
        <ConvexOrganizationRoleList roles={MOCK_ROLES} />
      </PreviewVariant>
      <PreviewVariant label="empty">
        <ConvexOrganizationRoleList roles={[]} />
      </PreviewVariant>
    </>
  );
}
