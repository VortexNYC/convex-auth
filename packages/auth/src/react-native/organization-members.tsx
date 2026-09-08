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
  StyleSheet,
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
    <View style={[styles.root, s.root]}>
      <View style={[styles.header, s.header]}>
        <Text style={[styles.title, s.title]}>{copy.title}</Text>
        <Text style={[styles.description, s.description]}>{copy.description}</Text>
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

      <View className="bg-border" style={[styles.divider, s.divider]} />
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
      <Text style={[styles.sectionTitle, stylesOverride.sectionTitle]}>
        {copy.inviteSectionTitle}
      </Text>
      <View style={[styles.inviteField, stylesOverride.inviteField]}>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={onEmailChange}
          placeholder={copy.emailPlaceholder}
          style={[styles.input, stylesOverride.input]}
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
          style={[styles.primaryButton, stylesOverride.primaryButton]}
        >
          <Text style={[styles.primaryButtonText, stylesOverride.primaryButtonText]}>
            {inviting ? copy.inviting : copy.invite}
          </Text>
        </Pressable>
        {error !== null ? (
          <Text className="text-destructive" style={[styles.errorState, stylesOverride.errorState]}>
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
    <View style={[styles.rolePicker, stylesOverride.rolePicker]}>
      {roles.map((role) => {
        const active = role.key === roleKey;
        return (
          <Pressable
            key={role.key}
            onPress={() => onRoleChange(role.key)}
            style={[
              styles.rolePickerItem,
              stylesOverride.rolePickerItem,
              active ? styles.rolePickerItemActive : undefined,
              active ? stylesOverride.rolePickerItemActive : undefined,
            ]}
          >
            <Text style={[styles.rolePickerItemText, stylesOverride.rolePickerItemText]}>
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
      <Text style={[styles.sectionTitle, stylesOverride.sectionTitle]}>
        {copy.membersSectionTitle}
      </Text>
      {members.length === 0 ? (
        <Text style={[styles.emptyState, stylesOverride.emptyState]}>{copy.noMembersLabel}</Text>
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
    <View style={[styles.memberItem, stylesOverride.memberItem]}>
      {member.imageUrl !== undefined && member.imageUrl.length > 0 ? (
        <Image
          source={{ uri: member.imageUrl }}
          style={[styles.memberImage, stylesOverride.memberImage]}
        />
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.memberName, stylesOverride.memberName]}>
          {member.name ?? member.email ?? member.userId}
          {member.isViewer === true ? " (you)" : ""}
        </Text>
        <Text style={[styles.memberMeta, stylesOverride.memberMeta]}>{member.roleKey}</Text>
      </View>
      {onRemoveMember !== undefined && member.isViewer !== true ? (
        <Pressable
          onPress={async () => {
            onError(null);
            const result = await onRemoveMember(member._id);
            if (!result.ok) onError(result.error);
          }}
          className="border-destructive"
          style={[styles.dangerButton, stylesOverride.dangerButton]}
        >
          <Text
            className="text-destructive"
            style={[styles.dangerButtonText, stylesOverride.dangerButtonText]}
          >
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
      <View className="bg-border" style={[styles.divider, stylesOverride.divider]} />
      <Text style={[styles.sectionTitle, stylesOverride.sectionTitle]}>
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
    <View style={[styles.memberItem, stylesOverride.memberItem]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.memberName, stylesOverride.memberName]}>{invitation.email}</Text>
        <Text style={[styles.memberMeta, stylesOverride.memberMeta]}>{invitation.roleKey}</Text>
      </View>
      {onCancelInvitation !== undefined ? (
        <Pressable
          onPress={async () => {
            onError(null);
            const result = await onCancelInvitation(invitation._id);
            if (!result.ok) onError(result.error);
          }}
          className="border-destructive"
          style={[styles.dangerButton, stylesOverride.dangerButton]}
        >
          <Text
            className="text-destructive"
            style={[styles.dangerButtonText, stylesOverride.dangerButtonText]}
          >
            {copy.cancelInvite}
          </Text>
        </Pressable>
      ) : null}
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
  inviteField: { paddingHorizontal: 16, gap: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  rolePicker: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  rolePickerItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  rolePickerItemActive: { opacity: 0.6 },
  rolePickerItemText: { fontSize: 13 },
  primaryButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
  },
  primaryButtonText: { fontSize: 14, fontWeight: "500" },
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  memberImage: { width: 28, height: 28, borderRadius: 14 },
  memberName: { fontSize: 14, fontWeight: "500" },
  memberMeta: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  dangerButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  dangerButtonText: { fontSize: 12 },
  emptyState: { paddingHorizontal: 16, fontSize: 13, opacity: 0.6 },
  divider: { height: 1, marginVertical: 12 },
  errorState: { paddingTop: 8, fontSize: 13 },
});
