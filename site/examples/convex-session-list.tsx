import { ConvexSessionList } from "../../packages/auth/src/react/convex-session-list";
import { mockAuthClient } from "./_shared";

export default function SessionListPreview() {
  return <ConvexSessionList authClient={mockAuthClient} />;
}
