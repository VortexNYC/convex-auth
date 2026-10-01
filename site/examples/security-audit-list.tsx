// Docs builds run before package builds, so previews import the component
// source rather than the @vortex-api/convex-auth dist exports.
import { ConvexSecurityAuditList } from "../../packages/auth/src/react/security-audit";
import { PREVIEW_NOW, PreviewVariant } from "./_shared";

const LOGS = [
  {
    _id: "log_1",
    action: "sign_in.success",
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
];

export default function SecurityAuditListPreview() {
  return (
    <>
      <PreviewVariant label="populated">
        <ConvexSecurityAuditList copy={{ emptyMessage: "No security events yet." }} logs={LOGS} />
      </PreviewVariant>
      <PreviewVariant label="empty">
        <ConvexSecurityAuditList copy={{ emptyMessage: "No security events yet." }} logs={[]} />
      </PreviewVariant>
    </>
  );
}
