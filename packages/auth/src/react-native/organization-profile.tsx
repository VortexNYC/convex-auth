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
  useColorScheme,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { clsx } from "clsx";

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

export type ExpoOrgProfileClassNames = {
  root?: string;
  header?: string;
  title?: string;
  description?: string;
  field?: string;
  label?: string;
  input?: string;
  submitButton?: string;
  submitButtonText?: string;
  dangerButton?: string;
  dangerButtonText?: string;
  successState?: string;
  errorState?: string;
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
  classNames?: ExpoOrgProfileClassNames;
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
  classNames: ExpoOrgProfileClassNames;
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

function OrganizationProfileDangerZone(props: {
  copy: Required<ExpoOrgProfileCopy>;
  deleting: boolean;
  onDelete?: () => void;
  styles: ExpoOrgProfileStyles;
  classNames: ExpoOrgProfileClassNames;
}) {
  const s = props.styles;
  const c = props.classNames;
  if (props.onDelete === undefined) {
    return null;
  }

  return (
    <View className={clsx("mt-6 w-full", c.field)} style={s.field}>
      <Text className={clsx("text-sm text-muted-foreground mb-1", c.label)} style={s.label}>
        {props.copy.dangerZoneTitle}
      </Text>
      <Pressable
        onPress={props.onDelete}
        disabled={props.deleting}
        className={clsx(
          "mt-2 w-full rounded-md border border-destructive p-3 items-center",
          c.dangerButton,
        )}
        style={s.dangerButton}
        accessibilityRole="button"
        accessibilityLabel={props.deleting ? props.copy.deleting : props.copy.deleteButton}
      >
        <Text
          className={clsx("text-sm font-medium text-destructive", c.dangerButtonText)}
          style={s.dangerButtonText}
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
  const c = props.classNames ?? {};
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
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

  const rootClassName = clsx(
    "w-full max-w-md self-center p-4 bg-background",
    c.root,
    isDark && "dark",
  );

  return (
    <View className={rootClassName} style={s.root}>
      <OrganizationProfileHeader copy={copy} styles={s} classNames={c} />
      <View className={clsx("w-full py-2", c.field)} style={s.field}>
        <Text className={clsx("text-sm text-muted-foreground mb-1", c.label)} style={s.label}>
          {copy.nameLabel}
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={copy.nameLabel}
          placeholderTextColorClassName="text-muted-foreground"
          autoCapitalize="words"
          autoCorrect={false}
          className={clsx(
            "w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm",
            c.input,
          )}
          style={s.input}
          accessibilityLabel={copy.nameLabel}
        />
      </View>
      {showSlug ? (
        <View className={clsx("w-full py-2", c.field)} style={s.field}>
          <Text className={clsx("text-sm text-muted-foreground mb-1", c.label)} style={s.label}>
            {copy.slugLabel}
          </Text>
          <TextInput
            value={slug}
            onChangeText={setSlug}
            placeholder={copy.slugLabel}
            placeholderTextColorClassName="text-muted-foreground"
            autoCapitalize="none"
            autoCorrect={false}
            className={clsx(
              "w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm",
              c.input,
            )}
            style={s.input}
            accessibilityLabel={copy.slugLabel}
          />
        </View>
      ) : null}
      <Pressable
        onPress={() => void handleSubmit()}
        disabled={submitting}
        className={clsx("w-full bg-primary rounded-md p-3 mt-4 items-center", c.submitButton)}
        style={s.submitButton}
        accessibilityRole="button"
        accessibilityLabel={submitting ? copy.submitting : copy.submit}
      >
        <Text
          className={clsx("text-sm font-semibold text-primary-foreground", c.submitButtonText)}
          style={s.submitButtonText}
        >
          {submitting ? copy.submitting : copy.submit}
        </Text>
      </Pressable>
      {success !== null ? (
        <Text className={clsx("text-sm text-success mt-2", c.successState)} style={s.successState}>
          {success}
        </Text>
      ) : null}
      {error !== null ? (
        <Text className={clsx("text-sm text-destructive mt-2", c.errorState)} style={s.errorState}>
          {error}
        </Text>
      ) : null}
      <OrganizationProfileDangerZone
        copy={copy}
        deleting={deleting}
        onDelete={props.onDelete === undefined ? undefined : () => void handleDelete()}
        styles={s}
        classNames={c}
      />
    </View>
  );
}
