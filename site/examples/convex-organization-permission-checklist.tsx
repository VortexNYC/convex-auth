import { useState } from "react";
import { ConvexOrganizationPermissionChecklist } from "../../packages/auth/src/react/organization-roles";
import { MOCK_PERMISSIONS } from "./_shared";

export default function OrganizationPermissionChecklistPreview() {
  const [selected, setSelected] = useState(["members:read", "members:write"]);
  return (
    <ConvexOrganizationPermissionChecklist
      copy={{ permissionCatalogEmptyMessage: "No permissions available." }}
      permissions={MOCK_PERMISSIONS}
      selectedPermissions={selected}
      onPermissionToggle={(permission) =>
        setSelected((current) =>
          current.includes(permission)
            ? current.filter((p) => p !== permission)
            : [...current, permission],
        )
      }
    />
  );
}
