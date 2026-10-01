import { ConvexProfileEditForm } from "../../packages/auth/src/react/convex-profile-edit-form";
import { MOCK_USER, mockAuthClient } from "./_shared";

export default function ProfileEditFormPreview() {
  return <ConvexProfileEditForm authClient={mockAuthClient} initialName={MOCK_USER.name} />;
}
