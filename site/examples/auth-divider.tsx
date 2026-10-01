import { AuthDivider } from "../../packages/auth/src/react/ui";
import { PreviewVariant } from "./_shared";

export default function AuthDividerPreview() {
  return (
    <>
      <PreviewVariant label="with label">
        <AuthDivider label="or continue with" />
      </PreviewVariant>
      <PreviewVariant label="bare">
        <AuthDivider />
      </PreviewVariant>
    </>
  );
}
