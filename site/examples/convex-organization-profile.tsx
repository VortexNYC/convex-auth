import { ConvexOrganizationProfile } from "../../packages/auth/src/react/organization-profile";

export default function OrganizationProfilePreview() {
  return (
    <ConvexOrganizationProfile
      organization={{
        _id: "o1",
        name: "Acme Corp",
        slug: "acme",
        status: "active",
      }}
      isAdmin
      onUpdate={() => {}}
      onDelete={() => {}}
    />
  );
}
