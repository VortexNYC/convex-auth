import { ConvexOrganizationInvitationLinkNotice } from "../../packages/auth/src/react/organization-members";

export default function InvitationLinkNoticePreview() {
  return (
    <ConvexOrganizationInvitationLinkNotice
      title="Share this link to invite members"
      value="https://app.example.com/invite/acme-t3k9x"
    />
  );
}
