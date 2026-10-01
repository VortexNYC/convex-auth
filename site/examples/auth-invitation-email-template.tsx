import { AuthInvitationEmailTemplate } from "../../packages/auth/src/react/email-templates/invitation-email";

export default function InvitationEmailTemplatePreview() {
  return (
    <AuthInvitationEmailTemplate
      organizationName="Acme Corp"
      roleName="Admin"
      inviterLabel="Ada Lovelace"
      acceptUrl="https://app.example.com/invite/acme-t3k9x"
      expiresAt={new Date(Date.now() + 3 * 86400000)}
    />
  );
}
