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
  View,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

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

  return (
    <View className="w-full py-2" style={s.root}>
      <View className="px-4 pb-3" style={s.header}>
        <Text className="text-base font-semibold text-foreground" style={s.title}>
          {copy.title}
        </Text>
        <Text className="text-sm text-muted-foreground mt-0.5" style={s.description}>
          {copy.description}
        </Text>
      </View>

      <ConvexOrganizationMembersInviteSection
        copy={copy}
        email={email}
        error={error}
        inviting={inviting}
        onEmailChange={setEmail}
        onInvite={handleInvite}
        onRoleChange={setRoleKey}
        roleKey={roleKey}
        roles={props.roles}
        stylesOverride={s}
      />

      <View className="bg-border h-px my-3" style={s.divider} />
      <ConvexOrganizationMembersList
        copy={copy}
        members={props.members}
        onError={setError}
        onRemoveMember={props.onRemoveMember}
        stylesOverride={s}
      />
      <ConvexOrganizationInvitationsList
        copy={copy}
        invitations={props.invitations}
        onCancelInvitation={props.onCancelInvitation}
        onError={setError}
        stylesOverride={s}
      />
    </View>
  );
}

function ConvexOrganizationMembersInviteSection({
  copy,
  email,
  error,
  inviting,
  onEmailChange,
  onInvite,
  onRoleChange,
  roleKey,
  roles,
  stylesOverride,
}: {
  copy: Required<ExpoOrgMembersCopy>;
  email: string;
  error: string | null;
  inviting: boolean;
  onEmailChange: (value: string) => void;
  onInvite: () => Promise<void>;
  onRoleChange: (roleKey: string) => void;
  roleKey: string;
  roles: readonly ExpoOrgRole[];
  stylesOverride: ExpoOrgMembersStyles;
}) {
  return (
    <>
      <Text
        className="text-xs text-muted-foreground px-4 mb-2 font-medium"
        style={stylesOverride.sectionTitle}
      >
        {copy.inviteSectionTitle}
      </Text>
      <View className="px-4 gap-2" style={stylesOverride.inviteField}>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={onEmailChange}
          placeholder={copy.emailPlaceholder}
          className="w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm"
          placeholderTextColorClassName="accent-muted-foreground"
          style={stylesOverride.input}
          value={email}
        />
        <ConvexOrganizationRolePicker
          onRoleChange={onRoleChange}
          roleKey={roleKey}
          roles={roles}
          stylesOverride={stylesOverride}
        />
        <Pressable
          disabled={inviting || email.trim().length === 0}
          onPress={() => void onInvite()}
          className="w-full px-3 py-2.5 rounded-md bg-primary items-center justify-center"
          style={stylesOverride.primaryButton}
          accessibilityRole="button"
          accessibilityLabel={copy.invite}
        >
          <Text
            className="text-sm font-medium text-primary-foreground"
            style={stylesOverride.primaryButtonText}
          >
            {inviting ? copy.inviting : copy.invite}
          </Text>
        </Pressable>
        {error !== null ? (
          <Text className="text-destructive pt-2 text-sm" style={stylesOverride.errorState}>
            {error}
          </Text>
        ) : null}
      </View>
    </>
  );
}

function ConvexOrganizationRolePicker({
  onRoleChange,
  roleKey,
  roles,
  stylesOverride,
}: {
  onRoleChange: (roleKey: string) => void;
  roleKey: string;
  roles: readonly ExpoOrgRole[];
  stylesOverride: ExpoOrgMembersStyles;
}) {
  return (
    <View className="flex-row gap-2 flex-wrap" style={stylesOverride.rolePicker}>
      {roles.map((role) => {
        const active = role.key === roleKey;
        return (
          <Pressable
            key={role.key}
            onPress={() => onRoleChange(role.key)}
            className={
              active
                ? "px-3 py-1.5 rounded-md border border-input bg-primary items-center justify-center"
                : "px-3 py-1.5 rounded-md border border-input bg-background items-center justify-center"
            }
            style={[
              stylesOverride.rolePickerItem,
              active ? stylesOverride.rolePickerItemActive : undefined,
            ]}
          >
            <Text
              className={`text-sm ${active ? "text-primary-foreground" : "text-foreground"}`}
              style={stylesOverride.rolePickerItemText}
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
  copy,
  members,
  onError,
  onRemoveMember,
  stylesOverride,
}: {
  copy: Required<ExpoOrgMembersCopy>;
  members: readonly ExpoOrgMember[];
  onError: (error: string | null) => void;
  onRemoveMember: ExpoOrgMembersProps["onRemoveMember"];
  stylesOverride: ExpoOrgMembersStyles;
}) {
  return (
    <>
      <Text
        className="text-xs text-muted-foreground px-4 mb-2 font-medium"
        style={stylesOverride.sectionTitle}
      >
        {copy.membersSectionTitle}
      </Text>
      {members.length === 0 ? (
        <Text className="px-4 text-sm text-muted-foreground" style={stylesOverride.emptyState}>
          {copy.noMembersLabel}
        </Text>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <ConvexOrganizationMemberRow
              copy={copy}
              member={item}
              onError={onError}
              onRemoveMember={onRemoveMember}
              stylesOverride={stylesOverride}
            />
          )}
          scrollEnabled={false}
        />
      )}
    </>
  );
}

function ConvexOrganizationMemberRow({
  copy,
  member,
  onError,
  onRemoveMember,
  stylesOverride,
}: {
  copy: Required<ExpoOrgMembersCopy>;
  member: ExpoOrgMember;
  onError: (error: string | null) => void;
  onRemoveMember: ExpoOrgMembersProps["onRemoveMember"];
  stylesOverride: ExpoOrgMembersStyles;
}) {
  return (
    <View className="flex-row items-center px-4 py-3 gap-3" style={stylesOverride.memberItem}>
      {member.imageUrl !== undefined && member.imageUrl.length > 0 ? (
        <Image
          source={{ uri: member.imageUrl }}
          className="w-7 h-7 rounded-full"
          style={stylesOverride.memberImage}
        />
      ) : null}
      <View className="flex-1">
        <Text className="text-sm font-medium text-foreground" style={stylesOverride.memberName}>
          {member.name ?? member.email ?? member.userId}
          {member.isViewer === true ? " (you)" : ""}
        </Text>
        <Text className="text-xs text-muted-foreground mt-0.5" style={stylesOverride.memberMeta}>
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
          className="px-2.5 py-1.5 rounded-md border border-destructive bg-background items-center justify-center"
          style={stylesOverride.dangerButton}
          accessibilityRole="button"
          accessibilityLabel={copy.remove}
        >
          <Text className="text-destructive text-xs" style={stylesOverride.dangerButtonText}>
            {copy.remove}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ConvexOrganizationInvitationsList({
  copy,
  invitations,
  onCancelInvitation,
  onError,
  stylesOverride,
}: {
  copy: Required<ExpoOrgMembersCopy>;
  invitations: readonly ExpoOrgInvitation[] | undefined;
  onCancelInvitation: ExpoOrgMembersProps["onCancelInvitation"];
  onError: (error: string | null) => void;
  stylesOverride: ExpoOrgMembersStyles;
}) {
  if (invitations === undefined || invitations.length === 0) {
    return null;
  }

  return (
    <View>
      <View className="bg-border h-px my-3" style={stylesOverride.divider} />
      <Text
        className="text-xs text-muted-foreground px-4 mb-2 font-medium"
        style={stylesOverride.sectionTitle}
      >
        {copy.invitationsSectionTitle}
      </Text>
      {invitations.map((invitation) => (
        <ConvexOrganizationInvitationRow
          copy={copy}
          invitation={invitation}
          key={invitation._id}
          onCancelInvitation={onCancelInvitation}
          onError={onError}
          stylesOverride={stylesOverride}
        />
      ))}
    </View>
  );
}

function ConvexOrganizationInvitationRow({
  copy,
  invitation,
  onCancelInvitation,
  onError,
  stylesOverride,
}: {
  copy: Required<ExpoOrgMembersCopy>;
  invitation: ExpoOrgInvitation;
  onCancelInvitation: ExpoOrgMembersProps["onCancelInvitation"];
  onError: (error: string | null) => void;
  stylesOverride: ExpoOrgMembersStyles;
}) {
  return (
    <View className="flex-row items-center px-4 py-3 gap-3" style={stylesOverride.memberItem}>
      <View className="flex-1">
        <Text className="text-sm font-medium text-foreground" style={stylesOverride.memberName}>
          {invitation.email}
        </Text>
        <Text className="text-xs text-muted-foreground mt-0.5" style={stylesOverride.memberMeta}>
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
          className="px-2.5 py-1.5 rounded-md border border-destructive bg-background items-center justify-center"
          style={stylesOverride.dangerButton}
          accessibilityRole="button"
          accessibilityLabel={copy.cancelInvite}
        >
          <Text className="text-destructive text-xs" style={stylesOverride.dangerButtonText}>
            {copy.cancelInvite}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
