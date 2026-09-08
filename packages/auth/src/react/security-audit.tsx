import { cn } from "./lib/ui";
import type { ReactNode } from "react";

export type ConvexSecurityAuditListItem = {
  _id: string;
  action: string;
  description?: string;
  resourceType?: string;
  targetUserEmail?: string;
  userName?: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  oldValue?: string;
  newValue?: string;
  createdAt: number;
  actor?: {
    _id: string;
    name?: string;
    email: string;
  } | null;
};

export type ConvexSecurityAuditListCopy = {
  loadingMessage?: string;
  emptyMessage: string;
  beforeLabel?: string;
  afterLabel?: string;
  userAgentLabel?: string;
  systemActorLabel?: string;
};

export type ConvexSecurityAuditListClassNames = {
  list?: string;
  row?: string;
  rowHeader?: string;
  rowContent?: string;
  title?: string;
  action?: string;
  metadata?: string;
  badge?: string;
  secondaryBadge?: string;
  details?: string;
  stateText?: string;
};

export type ConvexSecurityAuditListProps = {
  logs: readonly ConvexSecurityAuditListItem[] | undefined;
  copy: ConvexSecurityAuditListCopy;
  classNames?: ConvexSecurityAuditListClassNames;
  formatCreatedAt?: (createdAt: number) => string;
  renderBadge?: (args: { label: string; tone: "default" | "secondary" }) => ReactNode;
};

export type ConvexSecurityAuditRowProps = {
  log: ConvexSecurityAuditListItem;
  copy?: Partial<ConvexSecurityAuditListCopy>;
  classNames?: ConvexSecurityAuditListClassNames;
  formatCreatedAt?: (createdAt: number) => string;
  renderBadge?: (args: { label: string; tone: "default" | "secondary" }) => ReactNode;
};

const defaultCopy = {
  afterLabel: "After",
  beforeLabel: "Before",
  loadingMessage: "Loading audit log...",
  systemActorLabel: "System",
  userAgentLabel: "User agent",
} satisfies Omit<ConvexSecurityAuditListCopy, "emptyMessage">;

export function getConvexSecurityAuditActorLabel(
  log: Partial<Pick<ConvexSecurityAuditListItem, "actor" | "userEmail" | "userName">>,
  systemActorLabel = defaultCopy.systemActorLabel,
): string {
  return log.actor?.name ?? log.userName ?? log.actor?.email ?? log.userEmail ?? systemActorLabel;
}

export function formatConvexSecurityAuditCreatedAt(createdAt: number): string {
  return new Date(createdAt).toLocaleString();
}

export function ConvexSecurityAuditList({
  classNames,
  copy,
  formatCreatedAt = formatConvexSecurityAuditCreatedAt,
  logs,
  renderBadge,
}: ConvexSecurityAuditListProps) {
  const resolvedCopy = resolveCopy(copy);

  if (logs === undefined) {
    return (
      <p className={cn("text-foreground/50 text-sm", classNames?.stateText)}>
        {resolvedCopy.loadingMessage}
      </p>
    );
  }

  if (logs.length === 0) {
    return (
      <p className={cn("text-foreground/50 text-sm", classNames?.stateText)}>
        {resolvedCopy.emptyMessage}
      </p>
    );
  }

  return (
    <div className={cn("space-y-3", classNames?.list)}>
      {logs.map((log) => (
        <ConvexSecurityAuditRow
          classNames={classNames}
          copy={resolvedCopy}
          formatCreatedAt={formatCreatedAt}
          key={log._id}
          log={log}
          renderBadge={renderBadge}
        />
      ))}
    </div>
  );
}

export function ConvexSecurityAuditRow({
  classNames,
  copy,
  formatCreatedAt = formatConvexSecurityAuditCreatedAt,
  log,
  renderBadge,
}: ConvexSecurityAuditRowProps) {
  const resolvedCopy = resolveCopy({ emptyMessage: "", ...copy });
  const hasDetails = Boolean(log.oldValue || log.newValue || log.userAgent);

  return (
    <article
      className={cn("border-foreground/10 bg-foreground/5 rounded-lg border", classNames?.row)}
    >
      <div className={cn("space-y-3 p-4", classNames?.rowHeader)}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className={cn("text-foreground font-medium", classNames?.title)}>
              {log.description ?? log.action}
            </p>
            <p
              className={cn("text-foreground/45 text-xs font-medium uppercase", classNames?.action)}
            >
              {log.action}
            </p>
            <p className={cn("text-foreground/45 text-xs", classNames?.metadata)}>
              {getConvexSecurityAuditActorLabel(log, resolvedCopy.systemActorLabel)} -{" "}
              {formatCreatedAt(log.createdAt)}
            </p>
          </div>
          <ConvexSecurityAuditBadges classNames={classNames} log={log} renderBadge={renderBadge} />
        </div>
      </div>
      <ConvexSecurityAuditDetails
        classNames={classNames}
        copy={resolvedCopy}
        hasDetails={hasDetails}
        log={log}
      />
    </article>
  );
}

function ConvexSecurityAuditDetails({
  classNames,
  copy,
  hasDetails,
  log,
}: {
  classNames?: ConvexSecurityAuditListClassNames;
  copy: Required<ConvexSecurityAuditListCopy>;
  hasDetails: boolean;
  log: ConvexSecurityAuditListItem;
}) {
  if (!hasDetails) {
    return null;
  }

  return (
    <div
      className={cn(
        "border-foreground/10 text-foreground/60 grid gap-2 border-t px-4 pt-0 pb-4 text-xs md:grid-cols-2",
        classNames?.rowContent,
      )}
    >
      <div className={classNames?.details}>
        {copy.beforeLabel}: {log.oldValue ?? "-"}
      </div>
      <div className={classNames?.details}>
        {copy.afterLabel}: {log.newValue ?? "-"}
      </div>
      {log.userAgent ? (
        <div className={cn("md:col-span-2", classNames?.details)}>
          {copy.userAgentLabel}: {log.userAgent}
        </div>
      ) : null}
    </div>
  );
}

function ConvexSecurityAuditBadges({
  classNames,
  log,
  renderBadge,
}: {
  classNames?: ConvexSecurityAuditListClassNames;
  log: ConvexSecurityAuditListItem;
  renderBadge?: ConvexSecurityAuditRowProps["renderBadge"];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {log.resourceType
        ? renderAuditBadge({
            classNames,
            label: log.resourceType,
            renderBadge,
            tone: "secondary",
          })
        : null}
      {log.targetUserEmail
        ? renderAuditBadge({
            classNames,
            label: log.targetUserEmail,
            renderBadge,
            tone: "default",
          })
        : null}
      {log.ipAddress
        ? renderAuditBadge({
            classNames,
            label: `IP ${log.ipAddress}`,
            renderBadge,
            tone: "default",
          })
        : null}
    </div>
  );
}

function renderAuditBadge(args: {
  classNames: ConvexSecurityAuditListClassNames | undefined;
  label: string;
  renderBadge: ConvexSecurityAuditRowProps["renderBadge"];
  tone: "default" | "secondary";
}): ReactNode {
  if (args.renderBadge) {
    return args.renderBadge({ label: args.label, tone: args.tone });
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium",
        args.tone === "secondary"
          ? "border-foreground/10 bg-foreground/10 text-foreground/80"
          : "border-foreground/15 text-foreground/70",
        args.tone === "secondary" ? args.classNames?.secondaryBadge : args.classNames?.badge,
      )}
    >
      {args.label}
    </span>
  );
}

function resolveCopy(
  copy: Partial<ConvexSecurityAuditListCopy> & Pick<ConvexSecurityAuditListCopy, "emptyMessage">,
): Required<ConvexSecurityAuditListCopy> {
  return { ...defaultCopy, ...copy, emptyMessage: copy.emptyMessage };
}
