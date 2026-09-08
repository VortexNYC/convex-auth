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
  StyleSheet,
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
    <View style={[styles.root, s.root]}>
      <View style={[styles.header, s.header]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, s.title]}>{copy.title}</Text>
          <Text style={[styles.description, s.description]}>{copy.description}</Text>
        </View>
        {showRevokeOthers && otherSessionCount > 0 ? (
          <Pressable
            onPress={() => void handleRevokeOthers()}
            disabled={isRevoking}
            style={[styles.revokeOthersButton, s.revokeOthersButton]}
          >
            <Text style={[styles.revokeOthersButtonText, s.revokeOthersButtonText]}>
              {isRevoking ? copy.revokingOthersButton : copy.revokeOthersButton}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <View style={[styles.loadingState, s.loadingState]}>
          <ActivityIndicator />
          <Text style={s.itemMeta}>{copy.loading}</Text>
        </View>
      ) : error !== null ? (
        <Text className="text-destructive" style={[styles.errorState, s.errorState]}>
          {error === "Session listing is not available on this auth client"
            ? copy.unavailable
            : error}
        </Text>
      ) : (sessions ?? []).length === 0 ? (
        <Text style={[styles.emptyState, s.emptyState]}>{copy.empty}</Text>
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
        <Text className="text-destructive" style={[styles.errorState, s.errorState]}>
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
      style={[
        styles.item,
        s.item,
        isCurrent ? styles.itemCurrent : undefined,
        isCurrent ? s.itemCurrent : undefined,
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.itemPrimary, s.itemPrimary]}>
          {isCurrent ? copy.currentBadge : (session.userAgent ?? "Device")}
        </Text>
        <Text style={[styles.itemMeta, s.itemMeta]}>
          {copy.lastActivePrefix}: {formatTimestamp(session.updatedAt)}
        </Text>
      </View>
      {!isCurrent ? (
        <Pressable
          onPress={onRevoke}
          disabled={isRevoking}
          style={[styles.revokeButton, s.revokeButton]}
        >
          <Text style={[styles.revokeButtonText, s.revokeButtonText]}>
            {isRevoking ? copy.revoking : copy.revoke}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingVertical: 8 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  title: { fontSize: 16, fontWeight: "600" },
  description: { fontSize: 13, opacity: 0.6, marginTop: 2 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  itemCurrent: {
    // Consumer overrides via styles.itemCurrent for theme accent.
  },
  itemPrimary: { fontSize: 14, fontWeight: "500" },
  itemMeta: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  revokeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  revokeButtonText: { fontSize: 13 },
  revokeOthersButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  revokeOthersButtonText: { fontSize: 13 },
  emptyState: { padding: 16, fontSize: 13, opacity: 0.6 },
  loadingState: { padding: 16, alignItems: "center", gap: 8 },
  errorState: { padding: 16, fontSize: 13 },
});
