import { ConvexOrganizationRoleCreateForm } from "../../packages/auth/src/react/organization-roles";
import { MOCK_PERMISSIONS } from "./_shared";

export default function OrganizationRoleCreateFormPreview() {
  return (
    <ConvexOrganizationRoleCreateForm
      creating={false}
      state={{ name: "", permissions: ["members:read"] }}
      permissions={MOCK_PERMISSIONS}
      onNameChange={() => {}}
      onPermissionToggle={() => {}}
      onSubmit={() => {}}
    />
  );
}
