import { ConvexCreateOrganization } from "../../packages/auth/src/react/create-organization";

export default function CreateOrganizationPreview() {
  return <ConvexCreateOrganization isLoading={false} onCreate={() => {}} onCancel={() => {}} />;
}
