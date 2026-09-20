import type { OrganizationInvitationEmailDraft } from "./invitationEmail";

export type OrganizationInvitationEmailTemplateProps = {
  acceptUrl: string;
  organizationName: string;
  roleName: string;
  inviterLabel: string;
  expiresAt: number;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function OrganizationInvitationEmailTemplate(
  props: OrganizationInvitationEmailTemplateProps,
): { html: string; text: string } {
  const expiresAt = new Date(props.expiresAt).toUTCString();
  const subject = `You're invited to ${props.organizationName}`;

  const text = `${subject}\n\n${props.inviterLabel} invited you to join ${props.organizationName} as ${props.roleName}.\n\nAccept invitation: ${props.acceptUrl}\n\nThis invitation expires ${expiresAt}.`;
  const html = `<!doctype html>
<html>
  <head><title>${escapeHtml(subject)}</title></head>
  <body style="font-family:sans-serif;padding:24px;">
    <h1 style="margin:0 0 16px;">${escapeHtml(subject)}</h1>
    <p style="margin:0 0 12px;">${escapeHtml(props.inviterLabel)} invited you to join ${escapeHtml(
      props.organizationName,
    )} as ${escapeHtml(props.roleName)}.</p>
    <p style="margin:0 0 12px;"><a href="${escapeHtml(
      props.acceptUrl,
    )}" style="display:inline-block;padding:12px 24px;background-color:#111;color:#fff;border-radius:6px;text-decoration:none;">Accept invitation</a></p>
    <p style="margin:0 0 12px;color:#666;">This invitation expires ${escapeHtml(expiresAt)}.</p>
  </body>
</html>`;

  return { html, text };
}

export function renderOrganizationInvitationEmailDraft(args: {
  from: string;
  to: string;
  acceptUrl: string;
  organizationName: string;
  roleName: string;
  inviterLabel: string;
  expiresAt: number;
}): OrganizationInvitationEmailDraft {
  const { html, text } = OrganizationInvitationEmailTemplate(args);

  return {
    from: args.from,
    to: args.to,
    subject: `You're invited to ${args.organizationName}`,
    html,
    text,
  };
}
