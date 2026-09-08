import { Button, EmailHeading, EmailLayout, EmailStrong, EmailText } from "../lib/email";

export type AuthInvitationEmailTemplateProps = {
  organizationName: string;
  roleName: string;
  inviterLabel: string;
  acceptUrl: string;
  expiresAt: Date;
};

export function AuthInvitationEmailTemplate({
  organizationName,
  roleName,
  inviterLabel,
  acceptUrl,
  expiresAt,
}: AuthInvitationEmailTemplateProps) {
  const expiresText = expiresAt.toUTCString();

  return (
    <EmailLayout preview={`${inviterLabel} invited you to join ${organizationName} as ${roleName}`}>
      <EmailHeading>👋 You’re invited</EmailHeading>
      <EmailText>
        {inviterLabel} invited you to join <EmailStrong>{organizationName}</EmailStrong> as{" "}
        <EmailStrong>{roleName}</EmailStrong>.
      </EmailText>
      <Button href={acceptUrl}>Accept Invitation</Button>
      <EmailText>This invitation expires on {expiresText}.</EmailText>
      <EmailText>
        If the button does not work, copy and paste this link into your browser:
      </EmailText>
      <EmailText muted>{acceptUrl}</EmailText>
      <EmailText muted>
        If you are not expecting this invitation, please ignore this email.
      </EmailText>
    </EmailLayout>
  );
}
