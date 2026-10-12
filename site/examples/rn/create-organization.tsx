import { ConvexCreateOrganization } from "../../../packages/auth/src/react-native/create-organization";

export default function CreateOrganizationPreview() {
  return <ConvexCreateOrganization showSlugField onCreate={async () => ({ ok: true })} />;
}
