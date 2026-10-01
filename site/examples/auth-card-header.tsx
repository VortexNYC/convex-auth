import { AuthCardHeader } from "../../packages/auth/src/react/ui";
import { PreviewVariant } from "./_shared";

export default function AuthCardHeaderPreview() {
  return (
    <>
      <PreviewVariant label="title + description">
        <AuthCardHeader title="Create account" description="Join your workspace." />
      </PreviewVariant>
      <PreviewVariant label="title only">
        <AuthCardHeader title="Welcome back" />
      </PreviewVariant>
    </>
  );
}
