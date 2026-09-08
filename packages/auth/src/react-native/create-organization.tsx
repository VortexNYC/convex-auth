/**
 * ConvexCreateOrganization (RN) — form to create a new organization.
 * Consumer brings the create mutation (typically Convex) via the
 * onCreate callback; the package owns the form UX + validation.
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

export type ExpoCreateOrgStyles = {
  root?: StyleProp<ViewStyle>;
  header?: StyleProp<ViewStyle>;
  title?: StyleProp<TextStyle>;
  description?: StyleProp<TextStyle>;
  field?: StyleProp<ViewStyle>;
  label?: StyleProp<TextStyle>;
  input?: StyleProp<TextStyle>;
  submitButton?: StyleProp<ViewStyle>;
  submitButtonText?: StyleProp<TextStyle>;
  errorState?: StyleProp<TextStyle>;
};

export type ExpoCreateOrgCopy = {
  title?: string;
  description?: string;
  nameLabel?: string;
  namePlaceholder?: string;
  slugLabel?: string;
  slugPlaceholder?: string;
  submit?: string;
  submitting?: string;
};

export type ExpoCreateOrgProps = {
  styles?: ExpoCreateOrgStyles;
  copy?: ExpoCreateOrgCopy;
  showSlugField?: boolean;
  onCreate: (args: {
    name: string;
    slug?: string;
  }) => Promise<{ ok: boolean; error: string | null }>;
  onCreated?: (org: { name: string; slug?: string }) => void;
};

const DEFAULT_COPY: Required<ExpoCreateOrgCopy> = {
  title: "Create workspace",
  description: "Give your workspace a name. You can change it later.",
  nameLabel: "Workspace name",
  namePlaceholder: "Acme Inc.",
  slugLabel: "URL slug (optional)",
  slugPlaceholder: "acme",
  submit: "Create workspace",
  submitting: "Creating…",
};

export function ConvexCreateOrganization(props: ExpoCreateOrgProps) {
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const s = props.styles ?? {};
  const showSlug = props.showSlugField ?? false;
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    const trimmedName = name.trim();
    if (trimmedName.length === 0) return;
    const trimmedSlug = slug.trim();
    setSubmitting(true);
    try {
      const result = await props.onCreate({
        name: trimmedName,
        slug: trimmedSlug.length > 0 ? trimmedSlug : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setName("");
      setSlug("");
      props.onCreated?.({
        name: trimmedName,
        slug: trimmedSlug.length > 0 ? trimmedSlug : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={[styles.root, s.root]}>
      <View style={[styles.header, s.header]}>
        <Text style={[styles.title, s.title]}>{copy.title}</Text>
        <Text style={[styles.description, s.description]}>{copy.description}</Text>
      </View>
      <View style={[styles.field, s.field]}>
        <Text style={[styles.label, s.label]}>{copy.nameLabel}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={copy.namePlaceholder}
          style={[styles.input, s.input]}
        />
      </View>
      {showSlug ? (
        <View style={[styles.field, s.field]}>
          <Text style={[styles.label, s.label]}>{copy.slugLabel}</Text>
          <TextInput
            value={slug}
            onChangeText={setSlug}
            placeholder={copy.slugPlaceholder}
            autoCapitalize="none"
            style={[styles.input, s.input]}
          />
        </View>
      ) : null}
      <Pressable
        onPress={() => void handleSubmit()}
        disabled={submitting || name.trim().length === 0}
        style={[styles.submitButton, s.submitButton]}
      >
        <Text style={[styles.submitButtonText, s.submitButtonText]}>
          {submitting ? copy.submitting : copy.submit}
        </Text>
      </Pressable>
      {error !== null ? (
        <Text className="text-destructive" style={[styles.errorState, s.errorState]}>
          {error}
        </Text>
      ) : null}
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
  errorState: { paddingHorizontal: 16, paddingTop: 8, fontSize: 13 },
});
