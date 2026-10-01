import { ConvexForgotPasswordForm } from "../../packages/auth/src/react/convex-forgot-password-form";
import { mockAuthClient } from "./_shared";

export default function ForgotPasswordFormPreview() {
  return (
    <ConvexForgotPasswordForm
      authClient={mockAuthClient}
      resetPasswordUrl="https://app.example.com/reset-password"
    />
  );
}
