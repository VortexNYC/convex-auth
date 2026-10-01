import { ConvexSecurityAuditRow } from "../../packages/auth/src/react/security-audit";

export default function SecurityAuditRowPreview() {
  return (
    <ConvexSecurityAuditRow
      log={{
        _id: "log_1",
        action: "session.sign_in",
        description: "Signed in with password",
        userEmail: "ada@example.com",
        userName: "Ada Lovelace",
        ipAddress: "203.0.113.10",
        createdAt: Date.UTC(2025, 0, 16, 11, 0, 0),
      }}
    />
  );
}
