/**
 * ConvexOrganizationProfile (RN) — edit current org settings.
 * Mirrors the web component. Consumer brings the org data + the
 * update/delete callbacks.
 */
import { useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

export type ExpoOrgProfileOrganization = {
  _id: string;
  name: string;
  slug?: string;
  imageUrl?: string;
};

export type ExpoOrgProfileStyles = {
  root?: StyleProp<ViewStyle>;
  header?: StyleProp<ViewStyle>;
  title?: StyleProp<TextStyle>;
  description?: StyleProp<TextStyle>;
  field?: StyleProp<ViewStyle>;
  label?: StyleProp<TextStyle>;
  input?: StyleProp<TextStyle>;
  submitButton?: StyleProp<ViewStyle>;
  submitButtonText?: StyleProp<TextStyle>;
  dangerButton?: StyleProp<ViewStyle>;
  dangerButtonText?: StyleProp<TextStyle>;
  successState?: StyleProp<TextStyle>;
  errorState?: StyleProp<TextStyle>;
};

export type ExpoOrgProfileCopy = {
  title?: string;
  description?: string;
  nameLabel?: string;
  slugLabel?: string;
  submit?: string;
  submitting?: string;
  successMessage?: string;
  dangerZoneTitle?: string;
  deleteButton?: string;
  deleting?: string;
};

export type ExpoOrgProfileProps = {
  organization: ExpoOrgProfileOrganization | null;
  styles?: ExpoOrgProfileStyles;
  copy?: ExpoOrgProfileCopy;
  showSlugField?: boolean;
  onUpdate: (args: {
    name?: string;
    slug?: string;
  }) => Promise<{ ok: boolean; error: string | null }>;
  onDelete?: () => Promise<{ ok: boolean; error: string | null }>;
  onUpdated?: () => void;
};

const DEFAULT_COPY: Required<ExpoOrgProfileCopy> = {
  title: "Workspace settings",
  description: "Update your workspace's display.",
  nameLabel: "Workspace name",
  slugLabel: "URL slug",
  submit: "Save",
  submitting: "Saving…",
  successMessage: "Workspace updated.",
  dangerZoneTitle: "Danger zone",
  deleteButton: "Delete workspace",
  deleting: "Deleting…",
};

function OrganizationProfileHeader(props: {
  copy: Required<ExpoOrgProfileCopy>;
  styles: ExpoOrgProfileStyles;
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

function OrganizationProfileDangerZone(props: {
  copy: Required<ExpoOrgProfileCopy>;
  deleting: boolean;
  onDelete?: () => void;
  styles: ExpoOrgProfileStyles;
}) {
  if (props.onDelete === undefined) {
    return null;
  }

  return (
    <View className="mt-6 px-4">
      <Text className="text-sm text-muted-foreground mb-1" style={props.styles.label}>
        {props.copy.dangerZoneTitle}
      </Text>
      <Pressable
        onPress={props.onDelete}
        disabled={props.deleting}
        className="mt-2 px-3 py-2.5 rounded-md border border-destructive items-center"
        style={props.styles.dangerButton}
      >
        <Text
          className="text-destructive text-sm font-medium"
          style={props.styles.dangerButtonText}
        >
          {props.deleting ? props.copy.deleting : props.copy.deleteButton}
        </Text>
      </Pressable>
    </View>
  );
}

export function ConvexOrganizationProfile(props: ExpoOrgProfileProps) {
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const s = props.styles ?? {};
  const showSlug = props.showSlugField ?? true;
  const [name, setName] = useState(props.organization?.name ?? "");
  const [slug, setSlug] = useState(props.organization?.slug ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const next: { name?: string; slug?: string } = {};
      const trimmedName = name.trim();
      if (trimmedName !== (props.organization?.name ?? "").trim()) {
        next.name = trimmedName;
      }
      const trimmedSlug = slug.trim();
      if (showSlug && trimmedSlug !== (props.organization?.slug ?? "").trim()) {
        next.slug = trimmedSlug;
      }
      if (Object.keys(next).length === 0) {
        setSuccess(copy.successMessage);
        return;
      }
      const result = await props.onUpdate(next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(copy.successMessage);
      props.onUpdated?.();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (props.onDelete === undefined) return;
    setError(null);
    setDeleting(true);
    try {
      const result = await props.onDelete();
      if (!result.ok) setError(result.error);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <View className="w-full py-2" style={s.root}>
      <OrganizationProfileHeader copy={copy} styles={s} />
      <View className="px-4 py-2" style={s.field}>
        <Text className="text-sm text-muted-foreground mb-1" style={s.label}>
          {copy.nameLabel}
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          className="w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm"
          placeholderTextColorClassName="accent-muted-foreground"
          style={s.input}
        />
      </View>
      {showSlug ? (
        <View className="px-4 py-2" style={s.field}>
          <Text className="text-sm text-muted-foreground mb-1" style={s.label}>
            {copy.slugLabel}
          </Text>
          <TextInput
            value={slug}
            onChangeText={setSlug}
            autoCapitalize="none"
            className="w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm"
            placeholderTextColorClassName="accent-muted-foreground"
            style={s.input}
          />
        </View>
      ) : null}
      <Pressable
        onPress={() => void handleSubmit()}
        disabled={submitting}
        className="mx-4 mt-3 px-3 py-2.5 rounded-md bg-primary items-center justify-center"
        style={s.submitButton}
        accessibilityRole="button"
        accessibilityLabel={copy.submit}
      >
        <Text className="text-sm font-medium text-primary-foreground" style={s.submitButtonText}>
          {submitting ? copy.submitting : copy.submit}
        </Text>
      </Pressable>
      {success !== null ? (
        <Text className="text-success px-4 pt-2 text-sm" style={s.successState}>
          {success}
        </Text>
      ) : null}
      {error !== null ? (
        <Text className="text-destructive px-4 pt-2 text-sm" style={s.errorState}>
          {error}
        </Text>
      ) : null}
      <OrganizationProfileDangerZone
        copy={copy}
        deleting={deleting}
        onDelete={props.onDelete === undefined ? undefined : () => void handleDelete()}
        styles={s}
      />
    </View>
  );
}
