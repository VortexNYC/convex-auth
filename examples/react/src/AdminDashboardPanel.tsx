import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";

import { ConvexAdminDashboard, useAuthActions } from "@vortex-api/convex-auth/react";

import { api } from "../convex/_generated/api";

const PAGE_SIZE = 20;
const ADMIN_SESSION_KEY = "convex-auth:admin-session";

type StoredAdminSession = {
  token: string;
  refreshToken: string;
  sessionId: string;
};

export function AdminDashboardPanel() {
  const actions = useAuthActions();
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [auditsFilters, setAuditsFilters] = useState<{
    action?: string;
    targetType?: string;
    targetId?: string;
    adminId?: string;
    from?: string;
    to?: string;
  }>({});
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);

  const users = usePaginatedQuery(
    api.admin.listUsers,
    { search: search.trim() || undefined },
    { initialNumItems: PAGE_SIZE },
  );
  const sessions = usePaginatedQuery(api.admin.listSessions, {}, { initialNumItems: PAGE_SIZE });
  const organizations = usePaginatedQuery(
    api.admin.listOrganizations,
    {},
    { initialNumItems: PAGE_SIZE },
  );
  const audits = usePaginatedQuery(
    api.admin.listAdminAudits,
    {
      action: auditsFilters.action?.trim() || undefined,
      targetType: auditsFilters.targetType?.trim() || undefined,
      targetId: auditsFilters.targetId?.trim() || undefined,
      adminId: auditsFilters.adminId?.trim() || undefined,
      from: auditsFilters.from?.trim() || undefined,
      to: auditsFilters.to?.trim() || undefined,
    },
    { initialNumItems: PAGE_SIZE },
  );
  const selectedUser = useQuery(
    api.admin.getUser,
    selectedUserId ? { userId: selectedUserId } : "skip",
  );
  const selectedOrganization = useQuery(
    api.admin.getOrganization,
    selectedOrganizationId ? { organizationId: selectedOrganizationId } : "skip",
  );
  const organizationMembers = usePaginatedQuery(
    api.admin.listMembers,
    selectedOrganizationId ? { organizationId: selectedOrganizationId } : "skip",
    { initialNumItems: PAGE_SIZE },
  );
  const organizationRoles = useQuery(
    api.admin.listRoles,
    selectedOrganizationId ? { organizationId: selectedOrganizationId } : "skip",
  );

  const banUser = useMutation(api.admin.banUser);
  const unbanUser = useMutation(api.admin.unbanUser);
  const removeUser = useMutation(api.admin.removeUser);
  const revokeSession = useMutation(api.admin.revokeSession);
  const impersonateUser = useMutation(api.admin.impersonateUser);
  const updateMemberRole = useMutation(api.admin.updateMemberRole);
  const removeMember = useMutation(api.admin.removeMember);

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
      auditsFilters={auditsFilters}
      onAuditsFiltersChange={setAuditsFilters}
      usersSearch={search}
      onUsersSearchChange={setSearch}
      onViewUser={setSelectedUserId}
      selectedUser={selectedUser ?? undefined}
      onCloseUserDetail={() => setSelectedUserId(null)}
      onViewOrganization={setSelectedOrganizationId}
      selectedOrganization={selectedOrganization ?? undefined}
      onCloseOrganizationDetail={() => setSelectedOrganizationId(null)}
      organizationMembers={organizationMembers.results ?? []}
      organizationRoles={organizationRoles?.roles ?? []}
      onUpdateMemberRole={async (memberId, roleId) => {
        await updateMemberRole({ memberId, roleId });
      }}
      onRemoveMember={async (memberId) => {
        await removeMember({ memberId });
      }}
      organizationMembersPagination={{
        canLoadMore: organizationMembers.status === "CanLoadMore",
        isLoading: organizationMembers.isLoading,
        loadMore: organizationMembers.loadMore,
      }}
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
      onImpersonateUser={async (userId) => {
        if (!actions.token || !actions.refreshToken || !actions.sessionId) {
          throw new Error("Admin session is not available");
        }
        const stored: StoredAdminSession = {
          token: actions.token,
          refreshToken: actions.refreshToken,
          sessionId: actions.sessionId,
        };
        sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(stored));
        let result;
        try {
          result = await impersonateUser({ userId });
        } catch (error) {
          sessionStorage.removeItem(ADMIN_SESSION_KEY);
          throw error;
        }
        actions.setToken(result.token);
        actions.setRefreshToken(result.refreshToken);
        actions.setSessionId(result.sessionId);
      }}
    />
  );
}
