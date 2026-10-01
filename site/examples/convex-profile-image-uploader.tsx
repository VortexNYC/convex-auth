import { ConvexProfileImageUploader } from "../../packages/auth/src/react/convex-profile-image-uploader";
import { mockAuthClient } from "./_shared";

export default function ProfileImageUploaderPreview() {
  return (
    <ConvexProfileImageUploader
      authClient={mockAuthClient}
      uploadFile={async () => "https://example.com/avatar.png"}
    />
  );
}
