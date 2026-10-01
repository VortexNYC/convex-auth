import { useState } from "react";
import { ConvexOrganizationPermissionChecklist } from "../../packages/auth/src/react/organization-roles";
import { MOCK_PERMISSIONS } from "./_shared";

export default function OrganizationPermissionChecklistPreview() {
  const [selected, setSelected] = useState(["members:read", "members:write"]);
  return (
    <ConvexOrganizationPermissionChecklist
      copy={{
        actionErrorTitle: "Action failed",
        createTitle: "Create role",
        creatingLabel: "Creating…",
        customRoleLabel: "Custom",
        emptyMessage: "No roles yet.",
        loadingMessage: "Loading roles…",
        nameLabel: "Role name",
        namePlaceholder: "e.g. Support",
        permissionCatalogEmptyMessage: "No permissions available.",
        permissionLabel: "Permissions",
        roleListTitle: "Roles",
        submitLabel: "Create role",
        systemRoleLabel: "System",
      }}
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
