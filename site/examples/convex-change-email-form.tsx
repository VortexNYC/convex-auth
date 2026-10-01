// Docs builds run before package builds, so previews import the component
// source rather than the @vortex-api/convex-auth dist exports.
import { ConvexChangeEmailForm } from "../../packages/auth/src/react/convex-change-email-form";
import { mockAuthClient } from "./_shared";

export default function ChangeEmailFormPreview() {
  return <ConvexChangeEmailForm authClient={mockAuthClient} />;
}
