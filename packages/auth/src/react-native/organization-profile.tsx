/**
 * ConvexOrganizationProfile (RN) — edit current org settings.
 * Mirrors the web component. Consumer brings the org data + the
 * update/delete callbacks.
 */
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
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
    <View style={[styles.header, props.styles.header]}>
      <Text style={[styles.title, props.styles.title]}>{props.copy.title}</Text>
      <Text style={[styles.description, props.styles.description]}>{props.copy.description}</Text>
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
    <View style={{ marginTop: 24, paddingHorizontal: 16 }}>
      <Text style={[styles.label, props.styles.label]}>{props.copy.dangerZoneTitle}</Text>
      <Pressable
        onPress={props.onDelete}
        disabled={props.deleting}
        className="border-destructive"
        style={[styles.dangerButton, props.styles.dangerButton]}
      >
        <Text
          className="text-destructive"
          style={[styles.dangerButtonText, props.styles.dangerButtonText]}
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
    <View style={[styles.root, s.root]}>
      <OrganizationProfileHeader copy={copy} styles={s} />
      <View style={[styles.field, s.field]}>
        <Text style={[styles.label, s.label]}>{copy.nameLabel}</Text>
        <TextInput value={name} onChangeText={setName} style={[styles.input, s.input]} />
      </View>
      {showSlug ? (
        <View style={[styles.field, s.field]}>
          <Text style={[styles.label, s.label]}>{copy.slugLabel}</Text>
          <TextInput
            value={slug}
            onChangeText={setSlug}
            autoCapitalize="none"
            style={[styles.input, s.input]}
          />
        </View>
      ) : null}
      <Pressable
        onPress={() => void handleSubmit()}
        disabled={submitting}
        style={[styles.submitButton, s.submitButton]}
      >
        <Text style={[styles.submitButtonText, s.submitButtonText]}>
          {submitting ? copy.submitting : copy.submit}
        </Text>
      </Pressable>
      {success !== null ? (
        <Text style={[styles.successState, s.successState]}>{success}</Text>
      ) : null}
      {error !== null ? (
        <Text className="text-destructive" style={[styles.errorState, s.errorState]}>
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

const styles = StyleSheet.create({
  root: { paddingVertical: 8 },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontSize: 16, fontWeight: "600" },
  description: { fontSize: 13, opacity: 0.6, marginTop: 2 },
  field: { paddingHorizontal: 16, paddingVertical: 8 },
  label: { fontSize: 13, opacity: 0.7, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  submitButton: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
  },
  submitButtonText: { fontSize: 14, fontWeight: "500" },
  dangerButton: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
  },
  dangerButtonText: { fontSize: 14, fontWeight: "500" },
  successState: { paddingHorizontal: 16, paddingTop: 8, fontSize: 13 },
  errorState: { paddingHorizontal: 16, paddingTop: 8, fontSize: 13 },
});
