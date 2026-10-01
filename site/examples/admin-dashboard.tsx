// Docs builds run before package builds, so previews import the component
// source rather than the @vortex-api/convex-auth dist exports.
import { ConvexAdminDashboard } from "../../packages/auth/src/react/admin-dashboard";
import { PREVIEW_NOW } from "./_shared";

export default function AdminDashboardPreview() {
  return (
    <ConvexAdminDashboard
      users={[
        {
          _id: "u1",
          email: "ada@example.com",
          name: "Ada Lovelace",
          isActive: true,
          isSuperAdmin: true,
          roles: ["admin"],
          createdAt: PREVIEW_NOW - 86400000 * 120,
        },
        {
          _id: "u2",
          email: "grace@example.com",
          name: "Grace Hopper",
          isActive: true,
          roles: ["member"],
          createdAt: PREVIEW_NOW - 86400000 * 30,
        },
        {
          _id: "u3",
          email: "banned@example.com",
          name: "Banned User",
          isActive: false,
          bannedUntil: PREVIEW_NOW + 86400000,
          banReason: "Spam",
          createdAt: PREVIEW_NOW - 86400000 * 7,
        },
      ]}
      sessions={[
        {
          _id: "s1",
          sessionId: "sess_1",
          userId: "u1",
          ipAddress: "203.0.113.10",
          userAgent: "Safari",
          createdAt: PREVIEW_NOW - 3600000,
          expiresAt: PREVIEW_NOW + 86400000 * 7,
        },
      ]}
      organizations={[
        { _id: "o1", name: "Acme Corp", slug: "acme", status: "active" },
        { _id: "o2", name: "Globex", slug: "globex", status: "active" },
      ]}
      audits={[
        {
          _id: "a1",
          adminId: "u1",
          action: "user.ban",
          targetType: "user",
          targetId: "u3",
          result: "success",
          createdAt: PREVIEW_NOW - 7200000,
        },
      ]}
      onBanUser={() => {}}
      onUnbanUser={() => {}}
      onRevokeSession={() => {}}
      onImpersonateUser={() => {}}
    />
  );
}
