import { ConvexOrganizationMemberActionErrorNotice } from "../../packages/auth/src/react/organization-members";

export default function MemberActionErrorNoticePreview() {
  return (
    <ConvexOrganizationMemberActionErrorNotice
      title="Couldn't update member"
      message="You don't have permission to change this member's role."
    />
  );
}
