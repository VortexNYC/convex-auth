import { ConvexResetPasswordForm } from "../../packages/auth/src/react/convex-reset-password-form";
import { mockAuthClient } from "./_shared";

export default function ResetPasswordFormPreview() {
  return <ConvexResetPasswordForm authClient={mockAuthClient} token="preview-reset-token" />;
}
