import { ConvexOrganizationRoleList } from "../../packages/auth/src/react/organization-roles";
import { MOCK_ROLES } from "./_shared";

export default function OrganizationRoleListPreview() {
  return <ConvexOrganizationRoleList roles={MOCK_ROLES} />;
}
