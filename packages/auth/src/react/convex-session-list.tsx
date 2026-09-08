/**
 * ConvexSessionList — drop-in active-sessions UI for consumers.
 *
 * Replaces the per-consumer provider-style sessions table that some consumers
 * had to hand-write against `user.getSessions()` + `session.revoke()`.
 * Uses the package's session-management hooks (useConvexAuthSessionList +
 * useConvexAuthRevokeSession) so the component is purely presentational.
 *
 * Consumer usage:
 *   <ConvexSessionList
 *     authClient={authClient}
 *     currentSessionToken={currentSessionToken}
 *   />
 *
 * That's the whole API. Copy + classNames slots are documented in
 * ConvexSessionListClassNames + ConvexSessionListCopy below. Pile's
 * settings page can replace its placeholder "session listing coming
 * in a follow-up" with this in 3 lines (the new bundle being the
 * follow-up that finally lands).
 */
import { useState, type ReactNode } from "react";

import { useConvexAuthRevokeSession, useConvexAuthSessionList } from "./auth-client-hooks";
import type { ConvexAuthSessionListItem, ConvexBetterAuthClient } from "./auth-client-types";
import { useConvexAuthClientContext } from "./convex-auth-client-provider";
import { AuthCard, AuthCardContent, AuthCardHeader } from "./ui";

export type ConvexSessionListClassNames = {
  root?: string;
  list?: string;
  item?: string;
  itemCurrent?: string;
  itemMeta?: string;
  revokeButton?: string;
  emptyState?: string;
  loadingState?: string;
  errorState?: string;
};

export type ConvexSessionListCopy = {
  title?: string;
  description?: string;
  currentBadge?: string;
  lastActivePrefix?: string;
  revoke?: string;
  revoking?: string;
  loading?: string;
  empty?: string;
  unavailable?: string;
  revokeOthersButton?: string;
  revokingOthersButton?: string;
};

export type ConvexSessionListProps = {
  authClient?: ConvexBetterAuthClient | null;
  /**
   * Token of the session currently powering this browser. Used to
   * mark the row as the active session and to suppress the
   * "revoke" button on it (revoking your own session is sign-out,
   * which is a separate action from "revoke that other device").
   */
  currentSessionToken?: string | null;
  /**
   * Render a "Revoke all other sessions" button next to the title.
   * Defaults to true. Hides when no other sessions exist.
   */
  showRevokeOthersAction?: boolean;
  classNames?: ConvexSessionListClassNames;
  copy?: ConvexSessionListCopy;
  formatTimestamp?: (value: string | Date) => string;
};

const DEFAULT_COPY: Required<ConvexSessionListCopy> = {
  title: "Active sessions",
  description: "Devices currently signed in to this account.",
  currentBadge: "Current",
  lastActivePrefix: "Last active",
  revoke: "Revoke",
  revoking: "Revoking…",
  loading: "Loading sessions…",
  empty: "No active sessions found.",
  unavailable: "Session listing is not available on this auth client.",
  revokeOthersButton: "Revoke other sessions",
  revokingOthersButton: "Revoking…",
};

function defaultFormatTimestamp(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

export function ConvexSessionList(props: ConvexSessionListProps) {
  const contextClient = useConvexAuthClientContext();
  const authClient = props.authClient ?? contextClient;
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const cn = props.classNames ?? {};
  const fmt = props.formatTimestamp ?? defaultFormatTimestamp;

  const { sessions, isLoading, error, refetch } = useConvexAuthSessionList(authClient);
  const { revokeSession, revokeOtherSessions, isRevoking } = useConvexAuthRevokeSession(authClient);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const showRevokeOthers = props.showRevokeOthersAction ?? true;
  const otherSessionCount = (sessions ?? []).filter(
    (s) => s.token !== props.currentSessionToken,
  ).length;

  async function handleRevoke(token: string) {
    setRevokingToken(token);
    setLocalError(null);
    const result = await revokeSession({ token });
    if (!result.ok) {
      setLocalError(result.error);
    } else {
      await refetch();
    }
    setRevokingToken(null);
  }

  async function handleRevokeOthers() {
    setLocalError(null);
    const result = await revokeOtherSessions();
    if (!result.ok) {
      setLocalError(result.error);
    } else {
      await refetch();
    }
  }

  return (
    <AuthCard className={cn.root}>
      <AuthCardHeader title={copy.title} description={copy.description}>
        {showRevokeOthers && otherSessionCount > 0 ? (
          <button
            type="button"
            onClick={() => void handleRevokeOthers()}
            disabled={isRevoking}
            className={cn.revokeButton}
          >
            {isRevoking ? copy.revokingOthersButton : copy.revokeOthersButton}
          </button>
        ) : null}
      </AuthCardHeader>
      <AuthCardContent>
        {isLoading ? (
          <div className={cn.loadingState}>{copy.loading}</div>
        ) : error !== null ? (
          <div className={cn.errorState}>
            {error === "Session listing is not available on this auth client"
              ? copy.unavailable
              : error}
          </div>
        ) : (sessions ?? []).length === 0 ? (
          <div className={cn.emptyState}>{copy.empty}</div>
        ) : (
          <ul className={cn.list}>
            {(sessions ?? []).map((session) => {
              const isCurrent = session.token === props.currentSessionToken;
              return (
                <li
                  key={session.id}
                  className={[cn.item, isCurrent ? cn.itemCurrent : undefined]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <SessionRow
                    session={session}
                    isCurrent={isCurrent}
                    isRevoking={revokingToken === session.token}
                    copy={copy}
                    classNames={cn}
                    onRevoke={() => void handleRevoke(session.token)}
                    formatTimestamp={fmt}
                  />
                </li>
              );
            })}
          </ul>
        )}
        {localError !== null ? (
          <div className={cn.errorState} role="alert">
            {localError}
          </div>
        ) : null}
      </AuthCardContent>
    </AuthCard>
  );
}

function SessionRow(args: {
  session: ConvexAuthSessionListItem;
  isCurrent: boolean;
  isRevoking: boolean;
  copy: Required<ConvexSessionListCopy>;
  classNames: ConvexSessionListClassNames;
  onRevoke: () => void;
  formatTimestamp: (value: string | Date) => string;
}): ReactNode {
  const { session, isCurrent, isRevoking, copy, classNames, onRevoke, formatTimestamp } = args;
  return (
    <div>
      <div>
        <strong>{isCurrent ? copy.currentBadge : (session.userAgent ?? "Device")}</strong>
        {isCurrent ? null : session.ipAddress ? <span>{session.ipAddress}</span> : null}
      </div>
      <div className={classNames.itemMeta}>
        {copy.lastActivePrefix}: {formatTimestamp(session.updatedAt)}
      </div>
      {isCurrent ? null : (
        <button
          type="button"
          onClick={onRevoke}
          disabled={isRevoking}
          className={classNames.revokeButton}
        >
          {isRevoking ? copy.revoking : copy.revoke}
        </button>
      )}
    </div>
  );
}
