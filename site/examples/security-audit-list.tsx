// Docs builds run before package builds, so previews import the component
// source rather than the @vortex-api/convex-auth dist exports.
import { ConvexSecurityAuditList } from "../../packages/auth/src/react/security-audit";
import { PREVIEW_NOW } from "./_shared";

export default function SecurityAuditListPreview() {
  return (
    <ConvexSecurityAuditList
      copy={{ emptyMessage: "No audit events yet." }}
      logs={[
        {
          _id: "log_1",
          action: "session.sign_in",
          description: "Signed in with password",
          userEmail: "ada@example.com",
          userName: "Ada Lovelace",
          ipAddress: "203.0.113.10",
          createdAt: PREVIEW_NOW - 3600000,
        },
        {
          _id: "log_2",
          action: "password.change",
          description: "Password changed",
          userEmail: "ada@example.com",
          createdAt: PREVIEW_NOW - 86400000,
        },
        {
          _id: "log_3",
          action: "api_key.create",
          description: "API key issued",
          createdAt: PREVIEW_NOW - 86400000 * 3,
        },
      ]}
    />
  );
}
