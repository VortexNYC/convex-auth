import { ConvexAuthSignOutButton } from "../../packages/auth/src/react/auth-triggers";
import { PreviewVariant } from "./_shared";

export default function SignOutButtonPreview() {
  return (
    <PreviewVariant label="default">
      <ConvexAuthSignOutButton signOut={async () => {}} />
    </PreviewVariant>
  );
}
