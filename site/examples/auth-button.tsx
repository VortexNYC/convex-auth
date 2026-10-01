import { AuthButton } from "../../packages/auth/src/react/ui";
import { PreviewVariant } from "./_shared";

export default function AuthButtonPreview() {
  return (
    <>
      <PreviewVariant label="primary">
        <AuthButton variant="primary">Continue</AuthButton>
      </PreviewVariant>
      <PreviewVariant label="secondary">
        <AuthButton variant="secondary">Use another method</AuthButton>
      </PreviewVariant>
      <PreviewVariant label="ghost">
        <AuthButton variant="ghost">Cancel</AuthButton>
      </PreviewVariant>
      <PreviewVariant label="disabled">
        <AuthButton variant="primary" disabled>
          Continue
        </AuthButton>
      </PreviewVariant>
    </>
  );
}
