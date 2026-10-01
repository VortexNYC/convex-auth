import { useState } from "react";
import { ConvexOrganizationInviteForm } from "../../packages/auth/src/react/organization-members";
import { MOCK_ROLE_OPTIONS } from "./_shared";

export default function OrganizationInviteFormPreview() {
  const [state, setState] = useState<{
    email: string;
    roleTemplate: "owner" | "admin" | "manager" | "member" | "viewer";
  }>({ email: "", roleTemplate: "member" });
  return (
    <ConvexOrganizationInviteForm
      inviting={false}
      state={state}
      roleOptions={MOCK_ROLE_OPTIONS}
      onEmailChange={(email) => setState((s) => ({ ...s, email }))}
      onRoleTemplateChange={(roleTemplate) => setState((s) => ({ ...s, roleTemplate }))}
      onSubmit={() => {}}
    />
  );
}
