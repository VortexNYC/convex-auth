/**
 * ConvexOrganizationMembers (RN) — view/manage current org's members
 * + pending invitations. Props-driven mirror of the web component.
 *
 * Consumer brings: members list, invitations list, role list, and
 * callbacks for invite/remove/role-change/cancel-invite. The package
 * owns the UI shape.
 */
import { useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  Text,
  TextInput,
  useColorScheme,
  View,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { clsx } from "clsx";

export type ExpoOrgMember = {
  _id: string;
  userId: string;
  name?: string;
  email?: string;
  imageUrl?: string;
  roleKey: string;
  isViewer?: boolean;
};

export type ExpoOrgInvitation = {
  _id: string;
  email: string;
  roleKey: string;
  expiresAt?: number;
};

export type ExpoOrgRole = {
  key: string;
  label: string;
};

export type ExpoOrgMembersStyles = {
  root?: StyleProp<ViewStyle>;
  header?: StyleProp<ViewStyle>;
  title?: StyleProp<TextStyle>;
  description?: StyleProp<TextStyle>;
  sectionTitle?: StyleProp<TextStyle>;
  list?: StyleProp<ViewStyle>;
  inviteField?: StyleProp<ViewStyle>;
  input?: StyleProp<TextStyle>;
  rolePicker?: StyleProp<ViewStyle>;
  rolePickerItem?: StyleProp<ViewStyle>;
  rolePickerItemActive?: StyleProp<ViewStyle>;
  rolePickerItemText?: StyleProp<TextStyle>;
  primaryButton?: StyleProp<ViewStyle>;
  primaryButtonText?: StyleProp<TextStyle>;
  memberItem?: StyleProp<ViewStyle>;
  memberImage?: StyleProp<ImageStyle>;
  memberName?: StyleProp<TextStyle>;
  memberMeta?: StyleProp<TextStyle>;
  dangerButton?: StyleProp<ViewStyle>;
  dangerButtonText?: StyleProp<TextStyle>;
  emptyState?: StyleProp<TextStyle>;
  divider?: StyleProp<ViewStyle>;
  errorState?: StyleProp<TextStyle>;
};

export type ExpoOrgMembersClassNames = {
  root?: string;
  header?: string;
  title?: string;
  description?: string;
  sectionTitle?: string;
  list?: string;
  inviteField?: string;
  input?: string;
  rolePicker?: string;
  rolePickerItem?: string;
  rolePickerItemActive?: string;
  rolePickerItemText?: string;
  primaryButton?: string;
  primaryButtonText?: string;
  memberItem?: string;
  memberImage?: string;
  memberName?: string;
  memberMeta?: string;
  dangerButton?: string;
  dangerButtonText?: string;
  emptyState?: string;
  divider?: string;
  errorState?: string;
};

export type ExpoOrgMembersCopy = {
  title?: string;
  description?: string;
  inviteSectionTitle?: string;
  emailLabel?: string;
  emailPlaceholder?: string;
  invite?: string;
  inviting?: string;
  membersSectionTitle?: string;
  invitationsSectionTitle?: string;
  remove?: string;
  noMembersLabel?: string;
  noInvitationsLabel?: string;
  cancelInvite?: string;
};

export type ExpoOrgMembersProps = {
  members: readonly ExpoOrgMember[];
  invitations?: readonly ExpoOrgInvitation[];
  roles: readonly ExpoOrgRole[];
  styles?: ExpoOrgMembersStyles;
  classNames?: ExpoOrgMembersClassNames;
  copy?: ExpoOrgMembersCopy;
  onInvite: (args: {
    email: string;
    roleKey: string;
  }) => Promise<{ ok: boolean; error: string | null }>;
  onRemoveMember?: (memberId: string) => Promise<{ ok: boolean; error: string | null }>;
  onCancelInvitation?: (invitationId: string) => Promise<{ ok: boolean; error: string | null }>;
};

const DEFAULT_COPY: Required<ExpoOrgMembersCopy> = {
  title: "Members",
  description: "Invite teammates and manage roles.",
  inviteSectionTitle: "Invite member",
  emailLabel: "Email",
  emailPlaceholder: "teammate@example.com",
  invite: "Send invite",
  inviting: "Sending…",
  membersSectionTitle: "Active members",
  invitationsSectionTitle: "Pending invitations",
  remove: "Remove",
  noMembersLabel: "No members yet.",
  noInvitationsLabel: "No pending invitations.",
  cancelInvite: "Cancel",
};

export function ConvexOrganizationMembers(props: ExpoOrgMembersProps) {
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const s = props.styles ?? {};
  const c = props.classNames ?? {};
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const [email, setEmail] = useState("");
  const [roleKey, setRoleKey] = useState(props.roles[0]?.key ?? "");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleInvite() {
    setError(null);
    const trimmed = email.trim();
    if (trimmed.length === 0 || roleKey.length === 0) return;
    setInviting(true);
    try {
      const result = await props.onInvite({ email: trimmed, roleKey });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEmail("");
    } finally {
      setInviting(false);
    }
  }

  const rootClassName = clsx(
    "w-full max-w-md self-center p-4 bg-background",
    c.root,
    isDark && "dark",
  );

  return (
    <View className={rootClassName} style={s.root}>
      <View className={clsx("pb-3", c.header)} style={s.header}>
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

      <ConvexOrganizationMembersInviteSection
        copy={copy}
        classNames={c}
        email={email}
        error={error}
        inviting={inviting}
        onEmailChange={setEmail}
        onInvite={handleInvite}
        onRoleChange={setRoleKey}
        roleKey={roleKey}
        roles={props.roles}
        styles={s}
      />

      <View className={clsx("bg-border h-px my-3", c.divider)} style={s.divider} />
      <ConvexOrganizationMembersList
        classNames={c}
        copy={copy}
        members={props.members}
        onError={setError}
        onRemoveMember={props.onRemoveMember}
        styles={s}
      />
      <ConvexOrganizationInvitationsList
        classNames={c}
        copy={copy}
        invitations={props.invitations}
        onCancelInvitation={props.onCancelInvitation}
        onError={setError}
        styles={s}
      />
    </View>
  );
}

function ConvexOrganizationMembersInviteSection({
  copy,
  classNames,
  email,
  error,
  inviting,
  onEmailChange,
  onInvite,
  onRoleChange,
  roleKey,
  roles,
  styles,
}: {
  copy: Required<ExpoOrgMembersCopy>;
  classNames: ExpoOrgMembersClassNames;
  email: string;
  error: string | null;
  inviting: boolean;
  onEmailChange: (value: string) => void;
  onInvite: () => Promise<void>;
  onRoleChange: (roleKey: string) => void;
  roleKey: string;
  roles: readonly ExpoOrgRole[];
  styles: ExpoOrgMembersStyles;
}) {
  const s = styles;
  const c = classNames;
  return (
    <>
      <Text
        className={clsx("text-xs text-muted-foreground mb-2 font-medium", c.sectionTitle)}
        style={s.sectionTitle}
      >
        {copy.inviteSectionTitle}
      </Text>
      <View className={clsx("w-full gap-2", c.inviteField)} style={s.inviteField}>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={onEmailChange}
          placeholder={copy.emailPlaceholder}
          placeholderTextColorClassName="text-muted-foreground"
          autoComplete="email"
          textContentType="emailAddress"
          className={clsx(
            "w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm",
            c.input,
          )}
          style={s.input}
          value={email}
          accessibilityLabel={copy.emailLabel}
        />
        <ConvexOrganizationRolePicker
          classNames={c}
          onRoleChange={onRoleChange}
          roleKey={roleKey}
          roles={roles}
          styles={styles}
        />
        <Pressable
          disabled={inviting || email.trim().length === 0}
          onPress={() => void onInvite()}
          className={clsx("w-full bg-primary rounded-md p-3 mt-2 items-center", c.primaryButton)}
          style={s.primaryButton}
          accessibilityRole="button"
          accessibilityLabel={inviting ? copy.inviting : copy.invite}
        >
          <Text
            className={clsx("text-sm font-semibold text-primary-foreground", c.primaryButtonText)}
            style={s.primaryButtonText}
          >
            {inviting ? copy.inviting : copy.invite}
          </Text>
        </Pressable>
        {error !== null ? (
          <Text
            className={clsx("text-sm text-destructive mt-2", c.errorState)}
            style={s.errorState}
          >
            {error}
          </Text>
        ) : null}
      </View>
    </>
  );
}

function ConvexOrganizationRolePicker({
  classNames,
  onRoleChange,
  roleKey,
  roles,
  styles,
}: {
  classNames: ExpoOrgMembersClassNames;
  onRoleChange: (roleKey: string) => void;
  roleKey: string;
  roles: readonly ExpoOrgRole[];
  styles: ExpoOrgMembersStyles;
}) {
  const s = styles;
  const c = classNames;
  return (
    <View className={clsx("flex-row gap-2 flex-wrap", c.rolePicker)} style={s.rolePicker}>
      {roles.map((role) => {
        const active = role.key === roleKey;
        return (
          <Pressable
            key={role.key}
            onPress={() => onRoleChange(role.key)}
            className={clsx(
              "px-3 py-1.5 rounded-md border border-border",
              active ? "bg-primary border-primary" : "bg-card",
              c.rolePickerItem,
              active && c.rolePickerItemActive,
            )}
            style={[s.rolePickerItem, active ? s.rolePickerItemActive : undefined]}
            accessibilityRole="button"
            accessibilityLabel={role.label}
            accessibilityState={{ selected: active }}
          >
            <Text
              className={clsx(
                "text-sm",
                active ? "text-primary-foreground" : "text-card-foreground",
                c.rolePickerItemText,
              )}
              style={s.rolePickerItemText}
            >
              {role.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ConvexOrganizationMembersList({
  classNames,
  copy,
  members,
  onError,
  onRemoveMember,
  styles,
}: {
  classNames: ExpoOrgMembersClassNames;
  copy: Required<ExpoOrgMembersCopy>;
  members: readonly ExpoOrgMember[];
  onError: (error: string | null) => void;
  onRemoveMember: ExpoOrgMembersProps["onRemoveMember"];
  styles: ExpoOrgMembersStyles;
}) {
  const s = styles;
  const c = classNames;
  return (
    <>
      <Text
        className={clsx("text-xs text-muted-foreground mb-2 font-medium", c.sectionTitle)}
        style={s.sectionTitle}
      >
        {copy.membersSectionTitle}
      </Text>
      {members.length === 0 ? (
        <Text
          className={clsx("text-sm text-muted-foreground py-3", c.emptyState)}
          style={s.emptyState}
        >
          {copy.noMembersLabel}
        </Text>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item._id}
          contentContainerStyle={s.list}
          className="w-full"
          renderItem={({ item }) => (
            <ConvexOrganizationMemberRow
              classNames={c}
              copy={copy}
              member={item}
              onError={onError}
              onRemoveMember={onRemoveMember}
              styles={styles}
            />
          )}
          scrollEnabled={false}
        />
      )}
    </>
  );
}

function ConvexOrganizationMemberRow({
  classNames,
  copy,
  member,
  onError,
  onRemoveMember,
  styles,
}: {
  classNames: ExpoOrgMembersClassNames;
  copy: Required<ExpoOrgMembersCopy>;
  member: ExpoOrgMember;
  onError: (error: string | null) => void;
  onRemoveMember: ExpoOrgMembersProps["onRemoveMember"];
  styles: ExpoOrgMembersStyles;
}) {
  const s = styles;
  const c = classNames;
  return (
    <View className={clsx("flex-row items-center py-3 gap-3", c.memberItem)} style={s.memberItem}>
      {member.imageUrl !== undefined && member.imageUrl.length > 0 ? (
        <Image
          source={{ uri: member.imageUrl }}
          className={clsx("w-7 h-7 rounded-full", c.memberImage)}
          style={s.memberImage}
          accessibilityLabel={`${member.name ?? member.email ?? member.userId} avatar`}
        />
      ) : null}
      <View className="flex-1">
        <Text
          className={clsx("text-sm font-medium text-foreground", c.memberName)}
          style={s.memberName}
        >
          {member.name ?? member.email ?? member.userId}
          {member.isViewer === true ? " (you)" : ""}
        </Text>
        <Text
          className={clsx("text-xs text-muted-foreground mt-0.5", c.memberMeta)}
          style={s.memberMeta}
        >
          {member.roleKey}
        </Text>
      </View>
      {onRemoveMember !== undefined && member.isViewer !== true ? (
        <Pressable
          onPress={async () => {
            onError(null);
            const result = await onRemoveMember(member._id);
            if (!result.ok) onError(result.error);
          }}
          className={clsx("px-2.5 py-1.5 rounded-md border border-destructive", c.dangerButton)}
          style={s.dangerButton}
          accessibilityRole="button"
          accessibilityLabel={copy.remove}
        >
          <Text
            className={clsx("text-destructive text-xs", c.dangerButtonText)}
            style={s.dangerButtonText}
          >
            {copy.remove}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ConvexOrganizationInvitationsList({
  classNames,
  copy,
  invitations,
  onCancelInvitation,
  onError,
  styles,
}: {
  classNames: ExpoOrgMembersClassNames;
  copy: Required<ExpoOrgMembersCopy>;
  invitations: readonly ExpoOrgInvitation[] | undefined;
  onCancelInvitation: ExpoOrgMembersProps["onCancelInvitation"];
  onError: (error: string | null) => void;
  styles: ExpoOrgMembersStyles;
}) {
  const s = styles;
  const c = classNames;
  if (invitations === undefined || invitations.length === 0) {
    return null;
  }

  return (
    <View>
      <View className={clsx("bg-border h-px my-3", c.divider)} style={s.divider} />
      <Text
        className={clsx("text-xs text-muted-foreground mb-2 font-medium", c.sectionTitle)}
        style={s.sectionTitle}
      >
        {copy.invitationsSectionTitle}
      </Text>
      {invitations.map((invitation) => (
        <ConvexOrganizationInvitationRow
          classNames={c}
          copy={copy}
          invitation={invitation}
          key={invitation._id}
          onCancelInvitation={onCancelInvitation}
          onError={onError}
          styles={styles}
        />
      ))}
    </View>
  );
}

function ConvexOrganizationInvitationRow({
  classNames,
  copy,
  invitation,
  onCancelInvitation,
  onError,
  styles,
}: {
  classNames: ExpoOrgMembersClassNames;
  copy: Required<ExpoOrgMembersCopy>;
  invitation: ExpoOrgInvitation;
  onCancelInvitation: ExpoOrgMembersProps["onCancelInvitation"];
  onError: (error: string | null) => void;
  styles: ExpoOrgMembersStyles;
}) {
  const s = styles;
  const c = classNames;
  return (
    <View className={clsx("flex-row items-center py-3 gap-3", c.memberItem)} style={s.memberItem}>
      <View className="flex-1">
        <Text
          className={clsx("text-sm font-medium text-foreground", c.memberName)}
          style={s.memberName}
        >
          {invitation.email}
        </Text>
        <Text
          className={clsx("text-xs text-muted-foreground mt-0.5", c.memberMeta)}
          style={s.memberMeta}
        >
          {invitation.roleKey}
        </Text>
      </View>
      {onCancelInvitation !== undefined ? (
        <Pressable
          onPress={async () => {
            onError(null);
            const result = await onCancelInvitation(invitation._id);
            if (!result.ok) onError(result.error);
          }}
          className={clsx("px-2.5 py-1.5 rounded-md border border-destructive", c.dangerButton)}
          style={s.dangerButton}
          accessibilityRole="button"
          accessibilityLabel={copy.cancelInvite}
        >
          <Text
            className={clsx("text-destructive text-xs", c.dangerButtonText)}
            style={s.dangerButtonText}
          >
            {copy.cancelInvite}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
