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
    <View className="px-4 pb-3" style={props.styles.header}>
      <Text className="text-base font-semibold text-foreground" style={props.styles.title}>
        {props.copy.title}
      </Text>
      <Text className="text-sm text-muted-foreground mt-0.5" style={props.styles.description}>
        {props.copy.description}
      </Text>
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
      <View className="bg-border h-px my-3" style={props.styles.divider} />
      <Pressable
        onPress={() => void props.onCreateOrganization?.()}
        className="mx-4 px-3 py-2 rounded-md border border-input bg-background items-center justify-center"
        style={props.styles.primaryButton}
        accessibilityRole="button"
        accessibilityLabel={props.copy.createLabel}
      >
        <Text
          className="text-sm font-medium text-foreground"
          style={props.styles.primaryButtonText}
        >
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
    <View className="w-full py-2" style={s.root}>
      <OrganizationListHeader copy={copy} styles={s} />
      <Text className="text-xs text-muted-foreground px-4 mb-2 font-medium" style={s.sectionTitle}>
        {copy.membershipsLabel}
      </Text>
      {props.organizations.length === 0 ? (
        <Text className="px-4 text-sm text-muted-foreground" style={s.emptyState}>
          {copy.noOrganizationsLabel}
        </Text>
      ) : (
        <FlatList
          data={props.organizations}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => {
            const isCurrent = item._id === props.currentOrganizationId;
            return (
              <Pressable
                onPress={() => void props.onSelectOrganization(item._id)}
                className="flex-row items-center px-4 py-3 gap-3"
                style={[s.item, isCurrent ? s.itemActive : undefined]}
              >
                {item.imageUrl !== undefined && item.imageUrl.length > 0 ? (
                  <Image
                    source={{ uri: item.imageUrl }}
                    className="w-8 h-8 rounded-full"
                    style={s.itemImage}
                  />
                ) : (
                  <View
                    className="w-8 h-8 rounded-full border border-input opacity-40"
                    style={s.itemPlaceholder}
                  />
                )}
                <View className="flex-1">
                  <Text className="text-base font-medium text-foreground" style={s.itemName}>
                    {item.name}
                  </Text>
                  {item.roleKey !== undefined ? (
                    <Text className="text-xs text-muted-foreground mt-0.5" style={s.itemMeta}>
                      {item.roleKey}
                      {isCurrent ? ` · ${copy.currentLabel}` : ""}
                    </Text>
                  ) : isCurrent ? (
                    <Text className="text-xs text-muted-foreground mt-0.5" style={s.itemMeta}>
                      {copy.currentLabel}
                    </Text>
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
          <View className="bg-border h-px my-3" style={s.divider} />
          <Text
            className="text-xs text-muted-foreground px-4 mb-2 font-medium"
            style={s.sectionTitle}
          >
            {copy.invitationsLabel}
          </Text>
          {props.invitations.map((inv) => (
            <View
              key={inv._id}
              className="flex-row items-center px-4 py-3 gap-2"
              style={s.invitationItem}
            >
              <View className="flex-1">
                <Text className="text-base font-medium text-foreground" style={s.itemName}>
                  {inv.organizationName}
                </Text>
                {inv.roleKey !== undefined ? (
                  <Text className="text-xs text-muted-foreground mt-0.5" style={s.itemMeta}>
                    {inv.roleKey}
                  </Text>
                ) : null}
              </View>
              {props.onAcceptInvitation !== undefined ? (
                <Pressable
                  onPress={() => void props.onAcceptInvitation?.(inv._id)}
                  className="mx-4 px-3 py-2 rounded-md border border-input bg-background items-center justify-center"
                  style={s.primaryButton}
                  accessibilityRole="button"
                  accessibilityLabel={copy.acceptLabel}
                >
                  <Text className="text-sm font-medium text-foreground" style={s.primaryButtonText}>
                    {copy.acceptLabel}
                  </Text>
                </Pressable>
              ) : null}
              {props.onRejectInvitation !== undefined ? (
                <Pressable
                  onPress={() => void props.onRejectInvitation?.(inv._id)}
                  className="px-3 py-2 rounded-md border border-input bg-background items-center justify-center"
                  style={s.secondaryButton}
                  accessibilityRole="button"
                  accessibilityLabel={copy.rejectLabel}
                >
                  <Text className="text-sm text-foreground" style={s.secondaryButtonText}>
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
