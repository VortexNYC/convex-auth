import { useState } from "react";
import { ConvexOrganizationRoleCreateForm } from "../../packages/auth/src/react/organization-roles";
import { MOCK_PERMISSIONS } from "./_shared";

export default function OrganizationRoleCreateFormPreview() {
  const [state, setState] = useState({ name: "", permissions: ["members:read"] });
  return (
    <ConvexOrganizationRoleCreateForm
      creating={false}
      state={state}
      permissions={MOCK_PERMISSIONS}
      onNameChange={(name) => setState((s) => ({ ...s, name }))}
      onPermissionToggle={(permission) =>
        setState((s) => ({
          ...s,
          permissions: s.permissions.includes(permission)
            ? s.permissions.filter((p) => p !== permission)
            : [...s.permissions, permission],
        }))
      }
      onSubmit={() => {}}
    />
  );
}
