import * as React from "react";

import {
  cn,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./lib/ui";

export type ConvexAdminDashboardUser = {
  _id: string;
  email?: string | null;
  name?: string | null;
  isSuperAdmin?: boolean;
  isActive: boolean;
  bannedAt?: number;
  bannedUntil?: number;
  banReason?: string;
};

export type ConvexAdminDashboardSession = {
  token: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
};

export type ConvexAdminDashboardOrganization = {
  _id: string;
  name: string;
  slug?: string | null;
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

export type ConvexAdminDashboardClassNames = {
  root?: string;
  tabsList?: string;
  tabsContent?: string;
  card?: string;
  row?: string;
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
};

export type ConvexAdminDashboardProps = {
  users?: ConvexAdminDashboardUser[];
  sessions?: ConvexAdminDashboardSession[];
  organizations?: ConvexAdminDashboardOrganization[];
  audits?: ConvexAdminDashboardAudit[];
  classNames?: ConvexAdminDashboardClassNames;
  copy?: ConvexAdminDashboardCopy;
  onBanUser?: (userId: string, reason: string, until: number) => void;
  onUnbanUser?: (userId: string) => void;
  onRemoveUser?: (userId: string) => void;
  onImpersonateUser?: (userId: string) => void;
  onRevokeSession?: (token: string) => void;
};

export function ConvexAdminDashboard({
  users = [],
  sessions = [],
  organizations = [],
  audits = [],
  classNames,
  copy,
  onBanUser,
  onUnbanUser,
  onRemoveUser,
  onImpersonateUser,
  onRevokeSession,
}: ConvexAdminDashboardProps) {
  const c = {
    usersTitle: "Users",
    sessionsTitle: "Sessions",
    organizationsTitle: "Organizations",
    auditTitle: "Audit log",
    banLabel: "Ban",
    unbanLabel: "Unban",
    removeLabel: "Remove",
    impersonateLabel: "Impersonate",
    revokeLabel: "Revoke",
    ...copy,
  };

  return (
    <Tabs defaultValue="users" className={cn("w-full space-y-4", classNames?.root)}>
      <TabsList className={cn("w-full justify-start", classNames?.tabsList)}>
        <TabsTrigger value="users">{c.usersTitle}</TabsTrigger>
        <TabsTrigger value="sessions">{c.sessionsTitle}</TabsTrigger>
        <TabsTrigger value="organizations">{c.organizationsTitle}</TabsTrigger>
        <TabsTrigger value="audit">{c.auditTitle}</TabsTrigger>
      </TabsList>

      <TabsContent value="users" className={cn("space-y-4", classNames?.tabsContent)}>
        <Card className={classNames?.card}>
          <CardHeader>
            <CardTitle>{c.usersTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {users.length === 0 ? (
              <p className="text-muted-foreground text-sm">No users.</p>
            ) : (
              users.map((user) => (
                <div
                  key={user._id}
                  className={cn(
                    "flex items-center justify-between gap-4 border-b border-border py-2 last:border-0",
                    classNames?.row,
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{user.name ?? user.email ?? user._id}</p>
                    <p className="text-muted-foreground text-sm">{user.email ?? user._id}</p>
                    {user.bannedUntil !== undefined && (
                      <p className="text-destructive text-xs">
                        Banned until {new Date(user.bannedUntil).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {onImpersonateUser && (
                      <Button size="sm" onClick={() => onImpersonateUser(user._id)}>
                        {c.impersonateLabel}
                      </Button>
                    )}
                    {user.bannedUntil === undefined
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
                          <Button size="sm" variant="outline" onClick={() => onUnbanUser(user._id)}>
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
              ))
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="sessions" className={cn("space-y-4", classNames?.tabsContent)}>
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
                  key={session.token}
                  className={cn(
                    "flex items-center justify-between gap-4 border-b border-border py-2 last:border-0",
                    classNames?.row,
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm">{session.token}</p>
                    <p className="text-muted-foreground text-xs">User {session.userId}</p>
                  </div>
                  {onRevokeSession && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => onRevokeSession(session.token)}
                    >
                      {c.revokeLabel}
                    </Button>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="organizations" className={cn("space-y-4", classNames?.tabsContent)}>
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
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="audit" className={cn("space-y-4", classNames?.tabsContent)}>
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
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
