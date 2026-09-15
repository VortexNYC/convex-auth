/**
 * ConvexSessionList (RN) — drop-in active-sessions UI for Expo
 * consumers. Mirrors the web component's API + behavior. Uses RN
 * primitives (View/Text/Pressable/FlatList) instead of div/button.
 *
 * Consumer usage:
 *   <ConvexSessionList
 *     authClient={convexAuth.authClient}
 *     currentSessionToken={currentSessionToken}
 *   />
 *
 * Same API as the web version. Style overrides go through the
 * `styles` prop (RN style objects) and `classNames` (Uniwind classes).
 */
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  useColorScheme,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { clsx } from "clsx";

import {
  useConvexAuthRevokeSession,
  useConvexAuthSessionList,
  type ConvexAuthSessionListItem,
  useConvexAuthClientContext,
  type ConvexBetterAuthClient,
} from "../react/client";

export type ExpoSessionListStyles = {
  root?: StyleProp<ViewStyle>;
  header?: StyleProp<ViewStyle>;
  title?: StyleProp<TextStyle>;
  description?: StyleProp<TextStyle>;
  list?: StyleProp<ViewStyle>;
  item?: StyleProp<ViewStyle>;
  itemCurrent?: StyleProp<ViewStyle>;
  itemPrimary?: StyleProp<TextStyle>;
  itemMeta?: StyleProp<TextStyle>;
  revokeButton?: StyleProp<ViewStyle>;
  revokeButtonText?: StyleProp<TextStyle>;
  revokeOthersButton?: StyleProp<ViewStyle>;
  revokeOthersButtonText?: StyleProp<TextStyle>;
  emptyState?: StyleProp<TextStyle>;
  loadingState?: StyleProp<ViewStyle>;
  errorState?: StyleProp<TextStyle>;
};

export type ExpoSessionListClassNames = {
  root?: string;
  header?: string;
  title?: string;
  description?: string;
  list?: string;
  item?: string;
  itemCurrent?: string;
  itemPrimary?: string;
  itemMeta?: string;
  revokeButton?: string;
  revokeButtonText?: string;
  revokeOthersButton?: string;
  revokeOthersButtonText?: string;
  emptyState?: string;
  loadingState?: string;
  errorState?: string;
};

export type ExpoSessionListCopy = {
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

export type ExpoSessionListProps = {
  authClient?: ConvexBetterAuthClient | null;
  currentSessionToken?: string | null;
  showRevokeOthersAction?: boolean;
  styles?: ExpoSessionListStyles;
  classNames?: ExpoSessionListClassNames;
  copy?: ExpoSessionListCopy;
  formatTimestamp?: (value: string | Date) => string;
};

const DEFAULT_COPY: Required<ExpoSessionListCopy> = {
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

export function ConvexSessionList(props: ExpoSessionListProps) {
  const contextClient = useConvexAuthClientContext();
  const authClient = props.authClient ?? contextClient ?? null;
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const s = props.styles ?? {};
  const c = props.classNames ?? {};
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const fmt = props.formatTimestamp ?? defaultFormatTimestamp;

  const { sessions, isLoading, error, refetch } = useConvexAuthSessionList(authClient);
  const { revokeSession, revokeOtherSessions, isRevoking } = useConvexAuthRevokeSession(authClient);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const showRevokeOthers = props.showRevokeOthersAction ?? true;
  const otherSessionCount = (sessions ?? []).filter(
    (sess) => sess.token !== props.currentSessionToken,
  ).length;

  async function handleRevoke(token: string) {
    setRevokingToken(token);
    setLocalError(null);
    const result = await revokeSession({ token });
    if (!result.ok) setLocalError(result.error);
    else await refetch();
    setRevokingToken(null);
  }

  async function handleRevokeOthers() {
    setLocalError(null);
    const result = await revokeOtherSessions();
    if (!result.ok) setLocalError(result.error);
    else await refetch();
  }

  const rootClassName = clsx(
    "w-full max-w-md self-center p-4 bg-background",
    c.root,
    isDark && "dark",
  );

  const listClassName = clsx("w-full gap-1", c.list);

  return (
    <View className={rootClassName} style={s.root}>
      <View
        className={clsx("flex-row items-start justify-between pb-3 gap-3", c.header)}
        style={s.header}
      >
        <View className="flex-1">
          <Text className={clsx("text-2xl font-bold text-foreground", c.title)} style={s.title}>
            {copy.title}
          </Text>
          <Text
            className={clsx("text-sm text-muted-foreground", c.description)}
            style={s.description}
          >
            {copy.description}
          </Text>
        </View>
        {showRevokeOthers && otherSessionCount > 0 ? (
          <Pressable
            onPress={() => void handleRevokeOthers()}
            disabled={isRevoking}
            className={clsx(
              "px-3 py-1.5 rounded-md border border-border bg-card",
              c.revokeOthersButton,
            )}
            style={s.revokeOthersButton}
            accessibilityRole="button"
            accessibilityLabel={isRevoking ? copy.revokingOthersButton : copy.revokeOthersButton}
          >
            <Text
              className={clsx("text-sm text-card-foreground", c.revokeOthersButtonText)}
              style={s.revokeOthersButtonText}
            >
              {isRevoking ? copy.revokingOthersButton : copy.revokeOthersButton}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <View className={clsx("py-6 items-center gap-2", c.loadingState)} style={s.loadingState}>
          <ActivityIndicator colorClassName="text-primary" />
          <Text className={clsx("text-xs text-muted-foreground", c.itemMeta)} style={s.itemMeta}>
            {copy.loading}
          </Text>
        </View>
      ) : error !== null ? (
        <Text className={clsx("text-sm text-destructive py-3", c.errorState)} style={s.errorState}>
          {error === "Session listing is not available on this auth client"
            ? copy.unavailable
            : error}
        </Text>
      ) : (sessions ?? []).length === 0 ? (
        <Text
          className={clsx("text-sm text-muted-foreground py-3", c.emptyState)}
          style={s.emptyState}
        >
          {copy.empty}
        </Text>
      ) : (
        <FlatList
          data={sessions ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.list}
          className={listClassName}
          renderItem={({ item }) => {
            const isCurrent = item.token === props.currentSessionToken;
            return (
              <SessionRow
                session={item}
                isCurrent={isCurrent}
                isRevoking={revokingToken === item.token}
                copy={copy}
                styles={s}
                classNames={c}
                onRevoke={() => void handleRevoke(item.token)}
                formatTimestamp={fmt}
              />
            );
          }}
        />
      )}
      {localError !== null ? (
        <Text className={clsx("text-sm text-destructive mt-2", c.errorState)} style={s.errorState}>
          {localError}
        </Text>
      ) : null}
    </View>
  );
}

function SessionRow(args: {
  session: ConvexAuthSessionListItem;
  isCurrent: boolean;
  isRevoking: boolean;
  copy: Required<ExpoSessionListCopy>;
  styles: ExpoSessionListStyles;
  classNames: ExpoSessionListClassNames;
  onRevoke: () => void;
  formatTimestamp: (value: string | Date) => string;
}) {
  const {
    session,
    isCurrent,
    isRevoking,
    copy,
    styles: s,
    classNames: c,
    onRevoke,
    formatTimestamp,
  } = args;
  const itemClassName = clsx(
    "flex-row items-center py-3 gap-3",
    isCurrent && "bg-muted/50",
    c.item,
    isCurrent && c.itemCurrent,
  );
  return (
    <View className={itemClassName} style={[s.item, isCurrent ? s.itemCurrent : undefined]}>
      <View className="flex-1">
        <Text
          className={clsx("text-sm font-medium text-foreground", c.itemPrimary)}
          style={s.itemPrimary}
        >
          {isCurrent ? copy.currentBadge : (session.userAgent ?? "Device")}
        </Text>
        <Text
          className={clsx("text-xs text-muted-foreground mt-0.5", c.itemMeta)}
          style={s.itemMeta}
        >
          {copy.lastActivePrefix}: {formatTimestamp(session.updatedAt)}
        </Text>
      </View>
      {!isCurrent ? (
        <Pressable
          onPress={onRevoke}
          disabled={isRevoking}
          className={clsx("px-3 py-1.5 rounded-md border border-border bg-card", c.revokeButton)}
          style={s.revokeButton}
          accessibilityRole="button"
          accessibilityLabel={isRevoking ? copy.revoking : copy.revoke}
        >
          <Text
            className={clsx("text-sm text-card-foreground", c.revokeButtonText)}
            style={s.revokeButtonText}
          >
            {isRevoking ? copy.revoking : copy.revoke}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
