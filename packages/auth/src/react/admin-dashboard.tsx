import * as React from "react";

import {
  cn,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Separator,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "./lib/ui";

export type ConvexAdminDashboardUser = {
  _id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  isActive: boolean;
  isSuperAdmin?: boolean;
  roles?: string[] | null;
  bannedUntil?: number;
  banReason?: string;
  createdAt?: number;
};

export type ConvexAdminDashboardSession = {
  _id: string;
  sessionId: string;
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: number;
  expiresAt: number;
  revokedAt?: number;
};

export type ConvexAdminDashboardOrganization = {
  _id: string;
  name: string;
  slug?: string | null;
  imageUrl?: string | null;
  status?: string;
  createdBy?: string | null;
  createdAt?: number;
  updatedAt?: number;
};

export type ConvexAdminDashboardAudit = {
  _id: string;
  adminId: string;
  action: string;
  targetType: string;
  targetId: string;
  result: string;
  createdAt: number;
};

export type AdminSection = "users" | "sessions" | "organizations" | "audit";

export type ConvexAdminDashboardClassNames = {
  root?: string;
  sidebar?: string;
  content?: string;
  navItem?: string;
  card?: string;
  row?: string;
  loadMore?: string;
  search?: string;
};

export type ConvexAdminDashboardCopy = {
  usersTitle?: string;
  sessionsTitle?: string;
  organizationsTitle?: string;
  auditTitle?: string;
  banLabel?: string;
  unbanLabel?: string;
  removeLabel?: string;
  impersonateLabel?: string;
  revokeLabel?: string;
  loadMoreLabel?: string;
  loadingLabel?: string;
  viewLabel?: string;
  searchPlaceholder?: string;
  userSinceLabel?: string;
  activeLabel?: string;
  inactiveLabel?: string;
  superAdminLabel?: string;
  bannedLabel?: string;
  rolesLabel?: string;
};

export type ConvexAdminDashboardPagination = {
  canLoadMore?: boolean;
  isLoading?: boolean;
  loadMore?: (count: number) => void;
};

export type ConvexAdminDashboardProps = {
  users?: ConvexAdminDashboardUser[];
  sessions?: ConvexAdminDashboardSession[];
  organizations?: ConvexAdminDashboardOrganization[];
  audits?: ConvexAdminDashboardAudit[];
  defaultSection?: AdminSection;
  classNames?: ConvexAdminDashboardClassNames;
  copy?: ConvexAdminDashboardCopy;
  usersSearch?: string;
  onUsersSearchChange?: (value: string) => void;
  onViewUser?: (userId: string) => void;
  selectedUser?: ConvexAdminDashboardUser | null;
  onCloseUserDetail?: () => void;
  onBanUser?: (userId: string, reason: string, until: number) => void;
  onUnbanUser?: (userId: string) => void;
  onRemoveUser?: (userId: string) => void;
  onImpersonateUser?: (userId: string) => void;
  onRevokeSession?: (sessionId: string) => void;
  usersPagination?: ConvexAdminDashboardPagination;
  sessionsPagination?: ConvexAdminDashboardPagination;
  organizationsPagination?: ConvexAdminDashboardPagination;
  auditsPagination?: ConvexAdminDashboardPagination;
};

export function ConvexAdminDashboard({
  users = [],
  sessions = [],
  organizations = [],
  audits = [],
  defaultSection = "users",
  classNames,
  copy,
  usersSearch,
  onUsersSearchChange,
  onViewUser,
  selectedUser,
  onCloseUserDetail,
  onBanUser,
  onUnbanUser,
  onRemoveUser,
  onImpersonateUser,
  onRevokeSession,
  usersPagination,
  sessionsPagination,
  organizationsPagination,
  auditsPagination,
}: ConvexAdminDashboardProps) {
  const [active, setActive] = React.useState<AdminSection>(defaultSection);

  const c = {
    usersTitle: "Users",
    sessionsTitle: "Sessions",
    organizationsTitle: "Organisations",
    auditTitle: "Audit log",
    banLabel: "Ban",
    unbanLabel: "Unban",
    removeLabel: "Remove",
    impersonateLabel: "Impersonate",
    revokeLabel: "Revoke",
    loadMoreLabel: "Load more",
    loadingLabel: "Loading…",
    viewLabel: "View",
    searchPlaceholder: "Search by name or email…",
    userSinceLabel: "Created",
    activeLabel: "Active",
    inactiveLabel: "Inactive",
    superAdminLabel: "Super Admin",
    bannedLabel: "Banned",
    rolesLabel: "Roles",
    ...copy,
  };

  const sections: { value: AdminSection; label: string }[] = [
    { value: "users", label: c.usersTitle },
    { value: "sessions", label: c.sessionsTitle },
    { value: "organizations", label: c.organizationsTitle },
    { value: "audit", label: c.auditTitle },
  ];

  const renderLoadMore = (pagination: ConvexAdminDashboardPagination | undefined) => {
    if (!pagination?.loadMore || pagination.canLoadMore === false) {
      return null;
    }
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("mt-2 w-full", classNames?.loadMore)}
        disabled={pagination.isLoading}
        onClick={() => pagination.loadMore?.(20)}
      >
        {pagination.isLoading ? c.loadingLabel : c.loadMoreLabel}
      </Button>
    );
  };

  return (
    <div className={cn("flex h-full w-full flex-col md:flex-row", classNames?.root)}>
      <nav
        aria-label="Admin sections"
        className={cn(
          "border-border bg-background flex w-full flex-row gap-1 border-b p-2 md:w-64 md:flex-col md:border-b-0 md:border-r",
          classNames?.sidebar,
        )}
      >
        {sections.map((section) => (
          <Button
            key={section.value}
            type="button"
            variant={active === section.value ? "secondary" : "ghost"}
            className={cn("justify-start", classNames?.navItem)}
            aria-current={active === section.value ? "true" : undefined}
            onClick={() => setActive(section.value)}
          >
            {section.label}
          </Button>
        ))}
      </nav>

      <main className={cn("flex-1 overflow-y-auto p-4", classNames?.content)}>
        {active === "users" && (
          <Card className={classNames?.card}>
            <CardHeader>
              <CardTitle>{c.usersTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {onUsersSearchChange && (
                <Input
                  type="search"
                  placeholder={c.searchPlaceholder}
                  value={usersSearch ?? ""}
                  className={cn("h-9", classNames?.search)}
                  onChange={(event) => onUsersSearchChange(event.target.value)}
                />
              )}
              {users.length === 0 ? (
                <p className="text-muted-foreground text-sm">No users.</p>
              ) : (
                users.map((user) => {
                  const bannedUntil = user.bannedUntil ?? 0;
                  const isBanned = bannedUntil > Date.now();
                  return (
                    <div
                      key={user._id}
                      className={cn(
                        "flex items-center justify-between gap-4 border-b border-border py-2 last:border-0",
                        classNames?.row,
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {user.name ?? user.email ?? user._id}
                        </p>
                        <p className="text-muted-foreground text-sm">{user.email ?? user._id}</p>
                        {isBanned && (
                          <p className="text-destructive text-xs">
                            Banned until {new Date(bannedUntil).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {onViewUser && (
                          <Button size="sm" variant="outline" onClick={() => onViewUser(user._id)}>
                            {c.viewLabel}
                          </Button>
                        )}
                        {onImpersonateUser && (
                          <Button size="sm" onClick={() => onImpersonateUser(user._id)}>
                            {c.impersonateLabel}
                          </Button>
                        )}
                        {!isBanned
                          ? onBanUser && (
                              <Button
                                size="sm"
                                onClick={() =>
                                  onBanUser(user._id, "", Date.now() + 24 * 60 * 60 * 1000)
                                }
                              >
                                {c.banLabel}
                              </Button>
                            )
                          : onUnbanUser && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onUnbanUser(user._id)}
                              >
                                {c.unbanLabel}
                              </Button>
                            )}
                        {onRemoveUser && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => onRemoveUser(user._id)}
                          >
                            {c.removeLabel}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              {renderLoadMore(usersPagination)}
            </CardContent>
          </Card>
        )}

        {active === "sessions" && (
          <Card className={classNames?.card}>
            <CardHeader>
              <CardTitle>{c.sessionsTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {sessions.length === 0 ? (
                <p className="text-muted-foreground text-sm">No active sessions.</p>
              ) : (
                sessions.map((session) => (
                  <div
                    key={session.sessionId}
                    className={cn(
                      "flex items-center justify-between gap-4 border-b border-border py-2 last:border-0",
                      classNames?.row,
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm">{session.sessionId}</p>
                      <p className="text-muted-foreground text-xs">User {session.userId}</p>
                      {session.ipAddress !== undefined && (
                        <p className="text-muted-foreground text-xs">{session.ipAddress}</p>
                      )}
                      {session.userAgent !== undefined && (
                        <p className="text-muted-foreground truncate text-xs">
                          {session.userAgent}
                        </p>
                      )}
                    </div>
                    {onRevokeSession && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => onRevokeSession(session.sessionId)}
                      >
                        {c.revokeLabel}
                      </Button>
                    )}
                  </div>
                ))
              )}
              {renderLoadMore(sessionsPagination)}
            </CardContent>
          </Card>
        )}

        {active === "organizations" && (
          <Card className={classNames?.card}>
            <CardHeader>
              <CardTitle>{c.organizationsTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {organizations.length === 0 ? (
                <p className="text-muted-foreground text-sm">No organisations.</p>
              ) : (
                organizations.map((org) => (
                  <div
                    key={org._id}
                    className={cn("border-b border-border py-2 last:border-0", classNames?.row)}
                  >
                    <p className="font-medium">{org.name}</p>
                    {org.slug && <p className="text-muted-foreground text-sm">{org.slug}</p>}
                    {org.status && <p className="text-muted-foreground text-xs">{org.status}</p>}
                  </div>
                ))
              )}
              {renderLoadMore(organizationsPagination)}
            </CardContent>
          </Card>
        )}

        {active === "audit" && (
          <Card className={classNames?.card}>
            <CardHeader>
              <CardTitle>{c.auditTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {audits.length === 0 ? (
                <p className="text-muted-foreground text-sm">No admin actions recorded.</p>
              ) : (
                audits.map((audit) => (
                  <div
                    key={audit._id}
                    className={cn("border-b border-border py-2 last:border-0", classNames?.row)}
                  >
                    <p className="text-sm">
                      <span className="font-medium">{audit.action}</span> on {audit.targetType}{" "}
                      {audit.targetId} — {audit.result}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {new Date(audit.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
              {renderLoadMore(auditsPagination)}
            </CardContent>
          </Card>
        )}
      </main>

      {selectedUser && onCloseUserDetail && (
        <UserDetailSheet
          c={c}
          user={selectedUser}
          onCloseUserDetail={onCloseUserDetail}
          onImpersonateUser={onImpersonateUser}
          onBanUser={onBanUser}
          onUnbanUser={onUnbanUser}
          onRemoveUser={onRemoveUser}
        />
      )}
    </div>
  );
}

function UserDetailSheet({
  c,
  user,
  onCloseUserDetail,
  onImpersonateUser,
  onBanUser,
  onUnbanUser,
  onRemoveUser,
}: {
  c: Required<ConvexAdminDashboardCopy>;
  user: ConvexAdminDashboardUser;
  onCloseUserDetail?: () => void;
  onImpersonateUser?: (userId: string) => void;
  onBanUser?: (userId: string, reason: string, until: number) => void;
  onUnbanUser?: (userId: string) => void;
  onRemoveUser?: (userId: string) => void;
}) {
  const BAN_DURATION_MS = 24 * 60 * 60 * 1000;
  const bannedUntil = user.bannedUntil ?? 0;
  const isBanned = bannedUntil > Date.now();

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onCloseUserDetail?.();
      }}
    >
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{user.name ?? user.email ?? user._id}</SheetTitle>
          <SheetDescription>{user.email}</SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant={user.isActive ? "success" : "neutral"}>
              {user.isActive ? c.activeLabel : c.inactiveLabel}
            </Badge>
            {user.isSuperAdmin && <Badge variant="primary">{c.superAdminLabel}</Badge>}
            {isBanned && <Badge variant="destructive">{c.bannedLabel}</Badge>}
            {user.roles &&
              user.roles.map((role) => (
                <Badge key={role} variant="outline">
                  {role}
                </Badge>
              ))}
          </div>
          <Separator />
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">User ID</dt>
              <dd className="font-mono truncate">{user._id}</dd>
            </div>
            {isBanned && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Banned until</dt>
                <dd>{new Date(bannedUntil).toLocaleString()}</dd>
              </div>
            )}
            {user.banReason && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Ban reason</dt>
                <dd>{user.banReason}</dd>
              </div>
            )}
            {user.createdAt !== undefined && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{c.userSinceLabel}</dt>
                <dd>{new Date(user.createdAt).toLocaleString()}</dd>
              </div>
            )}
          </dl>
        </SheetBody>
        <SheetFooter>
          {onImpersonateUser && (
            <Button size="sm" onClick={() => onImpersonateUser(user._id)}>
              {c.impersonateLabel}
            </Button>
          )}
          {!isBanned
            ? onBanUser && (
                <Button
                  size="sm"
                  onClick={() => onBanUser(user._id, "", Date.now() + BAN_DURATION_MS)}
                >
                  {c.banLabel}
                </Button>
              )
            : onUnbanUser && (
                <Button size="sm" variant="outline" onClick={() => onUnbanUser(user._id)}>
                  {c.unbanLabel}
                </Button>
              )}
          {onRemoveUser && (
            <Button size="sm" variant="destructive" onClick={() => onRemoveUser(user._id)}>
              {c.removeLabel}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
