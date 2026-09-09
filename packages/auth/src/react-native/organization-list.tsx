/**
 * ConvexOrganizationList (RN) — props-driven org chooser. Lists
 * memberships + (optional) pending invitations, plus a create-org
 * action. Tap an org to select; tap an invitation's accept/reject
 * to act on it. Mirrors the web component's API.
 *
 * Useful as a stand-alone "pick a workspace" screen on B2B mobile
 * apps where the org-switcher modal isn't enough (e.g. first-run,
 * or settings → workspaces).
 */
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

export type ConvexOrgListOrganization = {
  _id: string;
  name: string;
  slug?: string;
  imageUrl?: string;
  roleKey?: string;
};

export type ConvexOrgListInvitation = {
  _id: string;
  organizationName: string;
  organizationImageUrl?: string;
  roleKey?: string;
  email?: string;
  expiresAt?: number;
};

export type ExpoOrgListStyles = {
  root?: StyleProp<ViewStyle>;
  header?: StyleProp<ViewStyle>;
  title?: StyleProp<TextStyle>;
  description?: StyleProp<TextStyle>;
  sectionTitle?: StyleProp<TextStyle>;
  item?: StyleProp<ViewStyle>;
  itemActive?: StyleProp<ViewStyle>;
  itemName?: StyleProp<TextStyle>;
  itemMeta?: StyleProp<TextStyle>;
  itemImage?: StyleProp<ImageStyle>;
  itemPlaceholder?: StyleProp<ViewStyle>;
  invitationItem?: StyleProp<ViewStyle>;
  primaryButton?: StyleProp<ViewStyle>;
  primaryButtonText?: StyleProp<TextStyle>;
  secondaryButton?: StyleProp<ViewStyle>;
  secondaryButtonText?: StyleProp<TextStyle>;
  divider?: StyleProp<ViewStyle>;
  emptyState?: StyleProp<TextStyle>;
};

export type ExpoOrgListCopy = {
  title?: string;
  description?: string;
  membershipsLabel?: string;
  invitationsLabel?: string;
  currentLabel?: string;
  acceptLabel?: string;
  rejectLabel?: string;
  createLabel?: string;
  noOrganizationsLabel?: string;
  noInvitationsLabel?: string;
  expiresLabel?: string;
};

export type ExpoOrgListProps = {
  organizations: readonly ConvexOrgListOrganization[];
  invitations?: readonly ConvexOrgListInvitation[];
  currentOrganizationId?: string | null;
  styles?: ExpoOrgListStyles;
  copy?: ExpoOrgListCopy;
  isLoading?: boolean;
  showInvitations?: boolean;
  onSelectOrganization: (organizationId: string) => void | Promise<void>;
  onAcceptInvitation?: (invitationId: string) => void | Promise<void>;
  onRejectInvitation?: (invitationId: string) => void | Promise<void>;
  onCreateOrganization?: () => void | Promise<void>;
};

const DEFAULT_COPY: Required<ExpoOrgListCopy> = {
  title: "Workspaces",
  description: "Pick a workspace to continue.",
  membershipsLabel: "Your workspaces",
  invitationsLabel: "Pending invitations",
  currentLabel: "Current",
  acceptLabel: "Accept",
  rejectLabel: "Decline",
  createLabel: "Create workspace",
  noOrganizationsLabel: "You're not in any workspaces yet.",
  noInvitationsLabel: "No pending invitations.",
  expiresLabel: "Expires",
};

function OrganizationListHeader(props: {
  copy: Required<ExpoOrgListCopy>;
  styles: ExpoOrgListStyles;
}) {
  return (
    <View style={[styles.header, props.styles.header]}>
      <Text style={[styles.title, props.styles.title]}>{props.copy.title}</Text>
      <Text style={[styles.description, props.styles.description]}>{props.copy.description}</Text>
    </View>
  );
}

function CreateOrganizationAction(props: {
  copy: Required<ExpoOrgListCopy>;
  onCreateOrganization?: () => void | Promise<void>;
  styles: ExpoOrgListStyles;
}) {
  if (props.onCreateOrganization === undefined) {
    return null;
  }

  return (
    <View>
      <View className="bg-border" style={[styles.divider, props.styles.divider]} />
      <Pressable
        onPress={() => void props.onCreateOrganization?.()}
        style={[styles.primaryButton, props.styles.primaryButton]}
      >
        <Text style={[styles.primaryButtonText, props.styles.primaryButtonText]}>
          {props.copy.createLabel}
        </Text>
      </Pressable>
    </View>
  );
}

export function ConvexOrganizationList(props: ExpoOrgListProps) {
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const s = props.styles ?? {};
  const showInvites = props.showInvitations ?? true;

  return (
    <View style={[styles.root, s.root]}>
      <OrganizationListHeader copy={copy} styles={s} />
      <Text style={[styles.sectionTitle, s.sectionTitle]}>{copy.membershipsLabel}</Text>
      {props.organizations.length === 0 ? (
        <Text style={[styles.emptyState, s.emptyState]}>{copy.noOrganizationsLabel}</Text>
      ) : (
        <FlatList
          data={props.organizations}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => {
            const isCurrent = item._id === props.currentOrganizationId;
            return (
              <Pressable
                onPress={() => void props.onSelectOrganization(item._id)}
                style={[
                  styles.item,
                  s.item,
                  isCurrent ? styles.itemActive : undefined,
                  isCurrent ? s.itemActive : undefined,
                ]}
              >
                {item.imageUrl !== undefined && item.imageUrl.length > 0 ? (
                  <Image source={{ uri: item.imageUrl }} style={[styles.itemImage, s.itemImage]} />
                ) : (
                  <View style={[styles.itemPlaceholder, s.itemPlaceholder]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemName, s.itemName]}>{item.name}</Text>
                  {item.roleKey !== undefined ? (
                    <Text style={[styles.itemMeta, s.itemMeta]}>
                      {item.roleKey}
                      {isCurrent ? ` · ${copy.currentLabel}` : ""}
                    </Text>
                  ) : isCurrent ? (
                    <Text style={[styles.itemMeta, s.itemMeta]}>{copy.currentLabel}</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
          scrollEnabled={false}
        />
      )}
      {showInvites && props.invitations !== undefined && props.invitations.length > 0 ? (
        <View>
          <View className="bg-border" style={[styles.divider, s.divider]} />
          <Text style={[styles.sectionTitle, s.sectionTitle]}>{copy.invitationsLabel}</Text>
          {props.invitations.map((inv) => (
            <View key={inv._id} style={[styles.invitationItem, s.invitationItem]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, s.itemName]}>{inv.organizationName}</Text>
                {inv.roleKey !== undefined ? (
                  <Text style={[styles.itemMeta, s.itemMeta]}>{inv.roleKey}</Text>
                ) : null}
              </View>
              {props.onAcceptInvitation !== undefined ? (
                <Pressable
                  onPress={() => void props.onAcceptInvitation?.(inv._id)}
                  style={[styles.primaryButton, s.primaryButton]}
                >
                  <Text style={[styles.primaryButtonText, s.primaryButtonText]}>
                    {copy.acceptLabel}
                  </Text>
                </Pressable>
              ) : null}
              {props.onRejectInvitation !== undefined ? (
                <Pressable
                  onPress={() => void props.onRejectInvitation?.(inv._id)}
                  style={[styles.secondaryButton, s.secondaryButton]}
                >
                  <Text style={[styles.secondaryButtonText, s.secondaryButtonText]}>
                    {copy.rejectLabel}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      <CreateOrganizationAction
        copy={copy}
        onCreateOrganization={props.onCreateOrganization}
        styles={s}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingVertical: 8 },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontSize: 16, fontWeight: "600" },
  description: { fontSize: 13, opacity: 0.6, marginTop: 2 },
  sectionTitle: {
    fontSize: 12,
    opacity: 0.6,
    paddingHorizontal: 16,
    marginBottom: 8,
    fontWeight: "500",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  itemActive: { opacity: 0.7 },
  itemImage: { width: 32, height: 32, borderRadius: 16 },
  itemPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    opacity: 0.4,
  },
  itemName: { fontSize: 15, fontWeight: "500" },
  itemMeta: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  invitationItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  primaryButton: {
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
  },
  primaryButtonText: { fontSize: 13, fontWeight: "500" },
  secondaryButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  secondaryButtonText: { fontSize: 13 },
  divider: { height: 1, marginVertical: 12 },
  emptyState: { paddingHorizontal: 16, fontSize: 13, opacity: 0.6 },
});
