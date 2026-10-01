import { ConvexEnableTwoFactorForm } from "../../packages/auth/src/react/convex-enable-two-factor-form";
import { mockAuthClient } from "./_shared";

export default function EnableTwoFactorFormPreview() {
  return <ConvexEnableTwoFactorForm authClient={mockAuthClient} />;
}
