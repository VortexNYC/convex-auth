// Docs builds run before package builds, so previews import the component
// source rather than the @vortex-api/convex-auth dist exports.
import { ConvexOrganizationSwitcher } from "../../../packages/auth/src/react-native/organization-switcher";

export default function OrganizationSwitcherPreview() {
  return (
    <ConvexOrganizationSwitcher
      currentOrganization={{ id: "org_acme", name: "Acme Inc." }}
      organizations={[
        { id: "org_acme", name: "Acme Inc." },
        { id: "org_beta", name: "Beta Labs" },
      ]}
      showPersonalAccount
      onSelectOrganization={() => {}}
      onSelectPersonalAccount={() => {}}
      onCreateOrganization={() => {}}
    />
  );
}
