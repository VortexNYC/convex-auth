import { ConvexOrganizationRoleManagerSurface } from "../../packages/auth/src/react/organization-roles";
import { ConvexPreviewShell, fnRef } from "./_shared";

export default function OrganizationRoleManagerSurfacePreview() {
  // Queries stay pending without a live deployment, so the surface renders
  // its loading branch.
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
