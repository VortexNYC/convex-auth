/**
 * ConvexCreateOrganization (RN) — form to create a new organization.
 * Consumer brings the create mutation (typically Convex) via the
 * onCreate callback; the package owns the form UX + validation.
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
    <View className="w-full py-2" style={s.root}>
      <View className="px-4 pb-3" style={s.header}>
        <Text className="text-base font-semibold text-foreground" style={s.title}>
          {copy.title}
        </Text>
        <Text className="text-sm text-muted-foreground mt-0.5" style={s.description}>
          {copy.description}
        </Text>
      </View>
      <View className="px-4 py-2" style={s.field}>
        <Text className="text-sm text-muted-foreground mb-1" style={s.label}>
          {copy.nameLabel}
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={copy.namePlaceholder}
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
            placeholder={copy.slugPlaceholder}
            autoCapitalize="none"
            className="w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm"
            placeholderTextColorClassName="accent-muted-foreground"
            style={s.input}
          />
        </View>
      ) : null}
      <Pressable
        onPress={() => void handleSubmit()}
        disabled={submitting || name.trim().length === 0}
        className="mx-4 mt-3 px-3 py-2.5 rounded-md bg-primary items-center justify-center"
        style={s.submitButton}
        accessibilityRole="button"
        accessibilityLabel={copy.submit}
      >
        <Text className="text-sm font-medium text-primary-foreground" style={s.submitButtonText}>
          {submitting ? copy.submitting : copy.submit}
        </Text>
      </Pressable>
      {error !== null ? (
        <Text className="text-destructive px-4 pt-2 text-sm" style={s.errorState}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
