import { ConvexOrganizationMembersSurface } from "../../packages/auth/src/react/organization-members";
import { ConvexPreviewShell, MOCK_ROLE_OPTIONS, fnRef } from "./_shared";

export default function OrganizationMembersSurfacePreview() {
  // The surface queries its own member list; with no live deployment the
  // query stays pending and the component renders its loading branch.
  return (
    <ConvexPreviewShell>
      <p style={{ color: "#888", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
        No deployment attached — the surface renders its loading state. Wired to a live backend it
        fills in with your data.
      </p>
      <ConvexOrganizationMembersSurface
        organizationId="o1"
        roleOptions={MOCK_ROLE_OPTIONS}
        refs={{
          inviteMember: fnRef("organizations:inviteMember"),
          listMembers: fnRef("organizations:listMembers"),
          reactivateMember: fnRef("organizations:reactivateMember"),
          setMemberRole: fnRef("organizations:setMemberRole"),
          suspendMember: fnRef("organizations:suspendMember"),
        }}
      />
    </ConvexPreviewShell>
  );
}
