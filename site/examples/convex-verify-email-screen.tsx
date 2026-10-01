import { ConvexVerifyEmailScreen } from "../../packages/auth/src/react/convex-verify-email-screen";
import { mockAuthClient } from "./_shared";

export default function VerifyEmailScreenPreview() {
  return (
    <ConvexVerifyEmailScreen
      authClient={mockAuthClient}
      token="preview-verify-token"
      userEmail="ada@example.com"
      resendCallbackUrl="https://app.example.com/verify-email"
    />
  );
}
