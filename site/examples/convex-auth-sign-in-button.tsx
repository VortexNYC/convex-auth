import { ConvexAuthSignInButton } from "../../packages/auth/src/react/auth-triggers";
import { PreviewVariant } from "./_shared";

export default function SignInButtonPreview() {
  return (
    <PreviewVariant label="default">
      <ConvexAuthSignInButton redirectToSignIn={() => {}} />
    </PreviewVariant>
  );
}
