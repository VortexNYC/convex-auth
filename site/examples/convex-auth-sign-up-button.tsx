import { ConvexAuthSignUpButton } from "../../packages/auth/src/react/auth-triggers";
import { PreviewVariant } from "./_shared";

export default function SignUpButtonPreview() {
  return (
    <PreviewVariant label="default">
      <ConvexAuthSignUpButton redirectToSignUp={() => {}} />
    </PreviewVariant>
  );
}
