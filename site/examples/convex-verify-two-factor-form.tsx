import { ConvexVerifyTwoFactorForm } from "../../packages/auth/src/react/convex-verify-two-factor-form";
import { mockAuthClient } from "./_shared";

export default function VerifyTwoFactorFormPreview() {
  return <ConvexVerifyTwoFactorForm authClient={mockAuthClient} />;
}
