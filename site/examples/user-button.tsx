// Docs builds run before package builds, so previews import the component
// source rather than the @vortex-api/convex-auth dist exports.
import { ConvexUserButton } from "../../packages/auth/src/react/user-button";

export default function UserButtonPreview() {
  return (
    <ConvexUserButton
      user={{ id: "u1", email: "ada@example.com", name: "Ada Lovelace" }}
      currentOrganizationId="o1"
      organizations={[
        { _id: "o1", name: "Acme Corp" },
        { _id: "o2", name: "Globex" },
      ]}
      onSignOut={() => {}}
      onManageAccount={() => {}}
      onSelectOrganization={() => {}}
      onCreateOrganization={() => {}}
    />
  );
}
