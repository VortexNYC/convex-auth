import { ConvexAuthPostSignUpPage } from "../../packages/auth/src/react/auth-pages";
import { MOCK_ORGANIZATIONS } from "./_shared";

export default function PostSignUpPagePreview() {
  return (
    <ConvexAuthPostSignUpPage
      currentOrganization={null}
      availableOrganizations={MOCK_ORGANIZATIONS.map((org) => ({
        ...org,
        canSelect: true,
      }))}
      invitationToken={null}
      ensureActiveOrganization={async () => {}}
      redeemInvitation={async () => {}}
      onCurrentOrganizationReady={() => {}}
      onOpenOrganizationSetup={() => {}}
    />
  );
}
