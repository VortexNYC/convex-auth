import { ConvexOrganizationRoleActionErrorNotice } from "../../packages/auth/src/react/organization-roles";

export default function RoleActionErrorNoticePreview() {
  return (
    <ConvexOrganizationRoleActionErrorNotice
      title="Couldn't create role"
      message="A role with that name already exists in this organization."
    />
  );
}
