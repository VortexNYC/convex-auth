import * as React from "react";

import { cn, Button, Card, CardContent, CardHeader, CardTitle } from "./lib/ui";

export type ConvexAdminDashboardUser = {
  _id: string;
  email?: string | null;
  name?: string | null;
  isSuperAdmin?: boolean;
  isActive: boolean;
  bannedUntil?: number;
  banReason?: string;
};

export type ConvexAdminDashboardSession = {
  _id: string;
  sessionId: string;
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

export type AdminSection = "users" | "sessions" | "organizations" | "audit";

export type ConvexAdminDashboardClassNames = {
  root?: string;
  sidebar?: string;
  content?: string;
  navItem?: string;
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
  defaultSection?: AdminSection;
  classNames?: ConvexAdminDashboardClassNames;
  copy?: ConvexAdminDashboardCopy;
  onBanUser?: (userId: string, reason: string, until: number) => void;
  onUnbanUser?: (userId: string) => void;
  onRemoveUser?: (userId: string) => void;
  onImpersonateUser?: (userId: string) => void;
  onRevokeSession?: (sessionId: string) => void;
};

export function ConvexAdminDashboard({
  users = [],
  sessions = [],
  organizations = [],
  audits = [],
  defaultSection = "users",
  classNames,
  copy,
  onBanUser,
  onUnbanUser,
  onRemoveUser,
  onImpersonateUser,
  onRevokeSession,
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
    ...copy,
  };

  const sections: { value: AdminSection; label: string }[] = [
    { value: "users", label: c.usersTitle },
    { value: "sessions", label: c.sessionsTitle },
    { value: "organizations", label: c.organizationsTitle },
    { value: "audit", label: c.auditTitle },
  ];

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
                ))
              )}
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
                  </div>
                ))
              )}
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
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
