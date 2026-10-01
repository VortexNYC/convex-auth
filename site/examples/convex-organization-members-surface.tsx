import { ConvexOrganizationMembersSurface } from "../../packages/auth/src/react/organization-members";
import { ConvexPreviewShell, MOCK_ROLE_OPTIONS, fnRef } from "./_shared";

export default function OrganizationMembersSurfacePreview() {
  // The surface queries its own member list; with no live deployment the
  // query stays pending and the component renders its loading branch.
  return (
    <ConvexPreviewShell>
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
