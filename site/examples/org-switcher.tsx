// Docs builds run before package builds, so previews import the component
// source rather than the @vortex-api/convex-auth dist exports.
import { ConvexOrganizationSwitcher } from "../../packages/auth/src/react/organization-switcher";

export default function OrgSwitcherPreview() {
  return (
    <ConvexOrganizationSwitcher
      organizations={[
        { _id: "o1", name: "Acme Corp", slug: "acme" },
        { _id: "o2", name: "Globex", slug: "globex" },
        { _id: "o3", name: "Initech", slug: "initech" },
      ]}
      currentOrganizationId="o1"
      showPersonalAccount
      enableSearch
      onSelectOrganization={() => {}}
      onCreateOrganization={() => {}}
    />
  );
}
