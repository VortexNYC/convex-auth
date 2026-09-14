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
 * `styles` prop (RN style objects) rather than className strings —
 * RN convention.
 */
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

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

  return (
    <View className="w-full py-2" style={s.root}>
      <View className="flex-row items-start px-4 pb-3 gap-3" style={s.header}>
        <View className="flex-1">
          <Text className="text-base font-semibold" style={s.title}>
            {copy.title}
          </Text>
          <Text className="text-sm text-muted-foreground mt-0.5" style={s.description}>
            {copy.description}
          </Text>
        </View>
        {showRevokeOthers && otherSessionCount > 0 ? (
          <Pressable
            onPress={() => void handleRevokeOthers()}
            disabled={isRevoking}
            className="px-3 py-1.5 rounded-md border border-input"
            style={s.revokeOthersButton}
          >
            <Text className="text-sm" style={s.revokeOthersButtonText}>
              {isRevoking ? copy.revokingOthersButton : copy.revokeOthersButton}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <View className="p-4 items-center gap-2" style={s.loadingState}>
          <ActivityIndicator />
          <Text className="text-xs text-muted-foreground" style={s.itemMeta}>
            {copy.loading}
          </Text>
        </View>
      ) : error !== null ? (
        <Text className="text-destructive p-4 text-sm" style={s.errorState}>
          {error === "Session listing is not available on this auth client"
            ? copy.unavailable
            : error}
        </Text>
      ) : (sessions ?? []).length === 0 ? (
        <Text className="p-4 text-sm text-muted-foreground" style={s.emptyState}>
          {copy.empty}
        </Text>
      ) : (
        <FlatList
          data={sessions ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => {
            const isCurrent = item.token === props.currentSessionToken;
            return (
              <SessionRow
                session={item}
                isCurrent={isCurrent}
                isRevoking={revokingToken === item.token}
                copy={copy}
                styles={s}
                onRevoke={() => void handleRevoke(item.token)}
                formatTimestamp={fmt}
              />
            );
          }}
        />
      )}
      {localError !== null ? (
        <Text className="text-destructive p-4 text-sm" style={s.errorState}>
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
  onRevoke: () => void;
  formatTimestamp: (value: string | Date) => string;
}) {
  const { session, isCurrent, isRevoking, copy, styles: s, onRevoke, formatTimestamp } = args;
  return (
    <View
      className="flex-row items-center px-4 py-3 gap-3"
      style={[s.item, isCurrent ? s.itemCurrent : undefined]}
    >
      <View className="flex-1">
        <Text className="text-sm font-medium" style={s.itemPrimary}>
          {isCurrent ? copy.currentBadge : (session.userAgent ?? "Device")}
        </Text>
        <Text className="text-xs text-muted-foreground mt-0.5" style={s.itemMeta}>
          {copy.lastActivePrefix}: {formatTimestamp(session.updatedAt)}
        </Text>
      </View>
      {!isCurrent ? (
        <Pressable
          onPress={onRevoke}
          disabled={isRevoking}
          className="px-3 py-1.5 rounded-md border border-input"
          style={s.revokeButton}
        >
          <Text className="text-sm" style={s.revokeButtonText}>
            {isRevoking ? copy.revoking : copy.revoke}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
