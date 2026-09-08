import { renderEmail, renderEmailText } from "../lib/email";

import { AuthInvitationEmailTemplate } from "./invitation-email";

export type AuthInvitationEmailDraft = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function renderAuthInvitationEmail(args: {
  from: string;
  to: string;
  organizationName: string;
  roleName: string;
  inviterLabel: string;
  acceptUrl: string;
  expiresAt: number;
}): Promise<AuthInvitationEmailDraft> {
  const { from, to, organizationName, roleName, inviterLabel, acceptUrl, expiresAt } = args;
  const template = (
    <AuthInvitationEmailTemplate
      organizationName={organizationName}
      roleName={roleName}
      inviterLabel={inviterLabel}
      acceptUrl={acceptUrl}
      expiresAt={new Date(expiresAt)}
    />
  );
  const [html, text] = await Promise.all([renderEmail(template), renderEmailText(template)]);

  return {
    from,
    to,
    subject: `You're invited to ${organizationName}`,
    html,
    text,
  };
}
