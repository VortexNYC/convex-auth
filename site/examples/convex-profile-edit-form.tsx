import { ConvexProfileEditForm } from "../../packages/auth/src/react/convex-profile-edit-form";
import { mockAuthClient } from "./_shared";

export default function ProfileEditFormPreview() {
  return <ConvexProfileEditForm authClient={mockAuthClient} />;
}
