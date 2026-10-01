import { ConvexOrganizationInviteForm } from "../../packages/auth/src/react/organization-members";
import { MOCK_ROLE_OPTIONS } from "./_shared";

export default function OrganizationInviteFormPreview() {
  return (
    <ConvexOrganizationInviteForm
      inviting={false}
      state={{ email: "", roleTemplate: "member" }}
      roleOptions={MOCK_ROLE_OPTIONS}
      onEmailChange={() => {}}
      onRoleTemplateChange={() => {}}
      onSubmit={() => {}}
    />
  );
}
