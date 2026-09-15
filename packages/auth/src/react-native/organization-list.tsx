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
  useColorScheme,
  View,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { clsx } from "clsx";

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
  list?: StyleProp<ViewStyle>;
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

export type ExpoOrgListClassNames = {
  root?: string;
  header?: string;
  title?: string;
  description?: string;
  sectionTitle?: string;
  list?: string;
  item?: string;
  itemActive?: string;
  itemName?: string;
  itemMeta?: string;
  itemImage?: string;
  itemPlaceholder?: string;
  invitationItem?: string;
  primaryButton?: string;
  primaryButtonText?: string;
  secondaryButton?: string;
  secondaryButtonText?: string;
  divider?: string;
  emptyState?: string;
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
  classNames?: ExpoOrgListClassNames;
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
  classNames: ExpoOrgListClassNames;
}) {
  const s = props.styles;
  const c = props.classNames;
  return (
    <View className={clsx("pb-3", c.header)} style={s.header}>
      <Text className={clsx("text-2xl font-bold text-foreground", c.title)} style={s.title}>
        {props.copy.title}
      </Text>
      <Text className={clsx("text-sm text-muted-foreground", c.description)} style={s.description}>
        {props.copy.description}
      </Text>
    </View>
  );
}

function CreateOrganizationAction(props: {
  copy: Required<ExpoOrgListCopy>;
  onCreateOrganization?: () => void | Promise<void>;
  styles: ExpoOrgListStyles;
  classNames: ExpoOrgListClassNames;
}) {
  const s = props.styles;
  const c = props.classNames;
  if (props.onCreateOrganization === undefined) {
    return null;
  }

  return (
    <View>
      <View className={clsx("bg-border h-px my-3", c.divider)} style={s.divider} />
      <Pressable
        onPress={() => void props.onCreateOrganization?.()}
        className={clsx(
          "w-full rounded-md border border-border bg-card p-3 items-center",
          c.primaryButton,
        )}
        style={s.primaryButton}
        accessibilityRole="button"
        accessibilityLabel={props.copy.createLabel}
      >
        <Text
          className={clsx("text-sm font-medium text-card-foreground", c.primaryButtonText)}
          style={s.primaryButtonText}
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
  const c = props.classNames ?? {};
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const showInvites = props.showInvitations ?? true;

  const rootClassName = clsx(
    "w-full max-w-md self-center p-4 bg-background",
    c.root,
    isDark && "dark",
  );

  return (
    <View className={rootClassName} style={s.root}>
      <OrganizationListHeader copy={copy} styles={s} classNames={c} />
      <Text
        className={clsx("text-xs text-muted-foreground mb-2 font-medium", c.sectionTitle)}
        style={s.sectionTitle}
      >
        {copy.membershipsLabel}
      </Text>
      {props.organizations.length === 0 ? (
        <Text
          className={clsx("text-sm text-muted-foreground py-3", c.emptyState)}
          style={s.emptyState}
        >
          {copy.noOrganizationsLabel}
        </Text>
      ) : (
        <FlatList
          data={props.organizations}
          keyExtractor={(item) => item._id}
          contentContainerStyle={s.list}
          className={clsx("w-full", c.list)}
          renderItem={({ item }) => {
            const isCurrent = item._id === props.currentOrganizationId;
            return (
              <Pressable
                onPress={() => void props.onSelectOrganization(item._id)}
                className={clsx(
                  "flex-row items-center py-3 gap-3",
                  isCurrent && "bg-muted/50",
                  c.item,
                  isCurrent && c.itemActive,
                )}
                style={[s.item, isCurrent ? s.itemActive : undefined]}
                accessibilityRole="button"
                accessibilityLabel={item.name}
              >
                {item.imageUrl !== undefined && item.imageUrl.length > 0 ? (
                  <Image
                    source={{ uri: item.imageUrl }}
                    className={clsx("w-8 h-8 rounded-full", c.itemImage)}
                    style={s.itemImage}
                    accessibilityLabel={`${item.name} workspace image`}
                  />
                ) : (
                  <View
                    className={clsx(
                      "w-8 h-8 rounded-full border border-input bg-muted opacity-40",
                      c.itemPlaceholder,
                    )}
                    style={s.itemPlaceholder}
                  />
                )}
                <View className="flex-1">
                  <Text
                    className={clsx("text-base font-medium text-foreground", c.itemName)}
                    style={s.itemName}
                  >
                    {item.name}
                  </Text>
                  {item.roleKey !== undefined ? (
                    <Text
                      className={clsx("text-xs text-muted-foreground mt-0.5", c.itemMeta)}
                      style={s.itemMeta}
                    >
                      {item.roleKey}
                      {isCurrent ? ` · ${copy.currentLabel}` : ""}
                    </Text>
                  ) : isCurrent ? (
                    <Text
                      className={clsx("text-xs text-muted-foreground mt-0.5", c.itemMeta)}
                      style={s.itemMeta}
                    >
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
          <View className={clsx("bg-border h-px my-3", c.divider)} style={s.divider} />
          <Text
            className={clsx("text-xs text-muted-foreground mb-2 font-medium", c.sectionTitle)}
            style={s.sectionTitle}
          >
            {copy.invitationsLabel}
          </Text>
          {props.invitations.map((inv) => (
            <View
              key={inv._id}
              className={clsx("flex-row items-center py-3 gap-2", c.invitationItem)}
              style={s.invitationItem}
            >
              <View className="flex-1">
                <Text
                  className={clsx("text-base font-medium text-foreground", c.itemName)}
                  style={s.itemName}
                >
                  {inv.organizationName}
                </Text>
                {inv.roleKey !== undefined ? (
                  <Text
                    className={clsx("text-xs text-muted-foreground mt-0.5", c.itemMeta)}
                    style={s.itemMeta}
                  >
                    {inv.roleKey}
                  </Text>
                ) : null}
              </View>
              {props.onAcceptInvitation !== undefined ? (
                <Pressable
                  onPress={() => void props.onAcceptInvitation?.(inv._id)}
                  className={clsx(
                    "px-3 py-2 rounded-md border border-border bg-card items-center",
                    c.primaryButton,
                  )}
                  style={s.primaryButton}
                  accessibilityRole="button"
                  accessibilityLabel={copy.acceptLabel}
                >
                  <Text
                    className={clsx(
                      "text-sm font-medium text-card-foreground",
                      c.primaryButtonText,
                    )}
                    style={s.primaryButtonText}
                  >
                    {copy.acceptLabel}
                  </Text>
                </Pressable>
              ) : null}
              {props.onRejectInvitation !== undefined ? (
                <Pressable
                  onPress={() => void props.onRejectInvitation?.(inv._id)}
                  className={clsx("px-3 py-2 rounded-md", c.secondaryButton)}
                  style={s.secondaryButton}
                  accessibilityRole="button"
                  accessibilityLabel={copy.rejectLabel}
                >
                  <Text
                    className={clsx("text-sm text-foreground", c.secondaryButtonText)}
                    style={s.secondaryButtonText}
                  >
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
        classNames={c}
      />
    </View>
  );
}
