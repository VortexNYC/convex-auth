import { AuthAlert } from "../../packages/auth/src/react/ui";
import { PreviewVariant } from "./_shared";

export default function AuthAlertPreview() {
  return (
    <>
      <PreviewVariant label="error">
        <AuthAlert tone="error" title="Sign-in failed">
          The password you entered doesn't match this account.
        </AuthAlert>
      </PreviewVariant>
      <PreviewVariant label="success">
        <AuthAlert tone="success" title="Email verified">
          You're all set — continue to your workspace.
        </AuthAlert>
      </PreviewVariant>
      <PreviewVariant label="warning">
        <AuthAlert tone="warning" title="Session expiring">
          You'll be signed out in 5 minutes unless you stay active.
        </AuthAlert>
      </PreviewVariant>
      <PreviewVariant label="default (no title)">
        <AuthAlert>Check your inbox for a verification link.</AuthAlert>
      </PreviewVariant>
    </>
  );
}
