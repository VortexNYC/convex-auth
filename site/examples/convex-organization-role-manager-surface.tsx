import { ConvexOrganizationRoleManagerSurface } from "../../packages/auth/src/react/organization-roles";
import { ConvexPreviewShell, fnRef } from "./_shared";

export default function OrganizationRoleManagerSurfacePreview() {
  // Queries stay pending without a live deployment, so the surface renders
  // its loading branch.
  return (
    <ConvexPreviewShell>
      <p style={{ color: "#888", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
        No deployment attached — the surface renders its loading state. Wired to a live backend it
        fills in with your data.
      </p>
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
