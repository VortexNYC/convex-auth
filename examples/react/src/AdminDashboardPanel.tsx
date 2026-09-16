import { useMutation } from "convex/react";
import { usePaginatedQuery } from "convex-helpers/react";

import { ConvexAdminDashboard } from "@vortex-api/convex-auth/react";

import { api } from "../convex/_generated/api";

const PAGE_SIZE = 20;

export function AdminDashboardPanel() {
  const users = usePaginatedQuery(api.admin.listUsers, {}, { initialNumItems: PAGE_SIZE });
  const sessions = usePaginatedQuery(api.admin.listSessions, {}, { initialNumItems: PAGE_SIZE });
  const organizations = usePaginatedQuery(
    api.admin.listOrganizations,
    {},
    { initialNumItems: PAGE_SIZE },
  );
  const audits = usePaginatedQuery(api.admin.listAdminAudits, {}, { initialNumItems: PAGE_SIZE });

  const banUser = useMutation(api.admin.banUser);
  const unbanUser = useMutation(api.admin.unbanUser);
  const removeUser = useMutation(api.admin.removeUser);
  const revokeSession = useMutation(api.admin.revokeSession);

  if (
    users.status === "LoadingFirstPage" ||
    sessions.status === "LoadingFirstPage" ||
    organizations.status === "LoadingFirstPage" ||
    audits.status === "LoadingFirstPage"
  ) {
    return <div className="text-muted-foreground text-sm">Loading admin dashboard…</div>;
  }

  return (
    <ConvexAdminDashboard
      users={users.results}
      sessions={sessions.results}
      organizations={organizations.results}
      audits={audits.results}
      usersPagination={{
        canLoadMore: users.status === "CanLoadMore",
        isLoading: users.isLoading,
        loadMore: users.loadMore,
      }}
      sessionsPagination={{
        canLoadMore: sessions.status === "CanLoadMore",
        isLoading: sessions.isLoading,
        loadMore: sessions.loadMore,
      }}
      organizationsPagination={{
        canLoadMore: organizations.status === "CanLoadMore",
        isLoading: organizations.isLoading,
        loadMore: organizations.loadMore,
      }}
      auditsPagination={{
        canLoadMore: audits.status === "CanLoadMore",
        isLoading: audits.isLoading,
        loadMore: audits.loadMore,
      }}
      onBanUser={async (userId, reason, until) => {
        await banUser({ userId, bannedUntil: until, reason });
      }}
      onUnbanUser={async (userId) => {
        await unbanUser({ userId });
      }}
      onRemoveUser={async (userId) => {
        await removeUser({ userId });
      }}
      onRevokeSession={async (sessionId) => {
        await revokeSession({ sessionId });
      }}
    />
  );
}
