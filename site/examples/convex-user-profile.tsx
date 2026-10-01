import { ConvexUserProfile } from "../../packages/auth/src/react/user-profile";

export default function UserProfilePreview() {
  return (
    <ConvexUserProfile
      user={{
        id: "u1",
        email: "ada@example.com",
        name: "Ada Lovelace",
        imageUrl: null,
        emailVerified: true,
        providers: [{ providerId: "password" }, { providerId: "google", providerName: "Google" }],
      }}
      onUpdateProfile={() => {}}
      onChangePassword={() => {}}
      onManageTwoFactor={() => {}}
    />
  );
}
