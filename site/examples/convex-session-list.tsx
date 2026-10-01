import { ConvexSessionList } from "../../packages/auth/src/react/convex-session-list";
import { PreviewVariant, mockAuthClient, mockAuthClientEmpty } from "./_shared";

export default function SessionListPreview() {
  return (
    <>
      <PreviewVariant label="populated">
        <ConvexSessionList authClient={mockAuthClient} />
      </PreviewVariant>
      <PreviewVariant label="empty">
        <ConvexSessionList authClient={mockAuthClientEmpty} />
      </PreviewVariant>
    </>
  );
}
