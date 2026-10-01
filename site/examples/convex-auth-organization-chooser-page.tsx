import { ConvexAuthOrganizationChooserPage } from "../../packages/auth/src/react/auth-pages";
import { MOCK_ORGANIZATIONS } from "./_shared";

export default function OrganizationChooserPagePreview() {
  return (
    <ConvexAuthOrganizationChooserPage
      currentOrganization={{ _id: "o1", name: "Acme Corp" }}
      organizations={MOCK_ORGANIZATIONS.map((org, index) => ({
        ...org,
        canSelect: true,
        roleTemplate: index === 0 ? "admin" : "member",
      }))}
      onSelectOrganization={async () => {}}
    />
  );
}
