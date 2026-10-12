import { ConvexOrganizationProfile } from "../../../packages/auth/src/react-native/organization-profile";

export default function OrganizationProfilePreview() {
  return (
    <ConvexOrganizationProfile
      organization={{ _id: "org_acme", name: "Acme Inc.", slug: "acme" }}
      showSlugField
      onUpdate={async () => ({ ok: true, error: null })}
      onDelete={async () => ({ ok: true, error: null })}
    />
  );
}
