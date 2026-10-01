import { ConvexOrganizationRoleManagerSurface } from "../../packages/auth/src/react/organization-roles";
import { ConvexPreviewShell, fnRef } from "./_shared";

export default function OrganizationRoleManagerSurfacePreview() {
  return (
    <ConvexPreviewShell>
      <ConvexOrganizationRoleManagerSurface
        refs={{
          createRole: fnRef("organizations:createRole"),
          listPermissions: fnRef("organizations:listPermissions"),
          listRoles: fnRef("organizations:listRoles"),
        }}
      />
    </ConvexPreviewShell>
  );
}
