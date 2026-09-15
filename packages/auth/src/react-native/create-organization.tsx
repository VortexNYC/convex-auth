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
  useColorScheme,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { clsx } from "clsx";

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

export type ExpoCreateOrgClassNames = {
  root?: string;
  header?: string;
  title?: string;
  description?: string;
  field?: string;
  label?: string;
  input?: string;
  submitButton?: string;
  submitButtonText?: string;
  errorState?: string;
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
  classNames?: ExpoCreateOrgClassNames;
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
  const c = props.classNames ?? {};
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
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
      <View className={clsx("w-full py-2", c.field)} style={s.field}>
        <Text className={clsx("text-sm text-muted-foreground mb-1", c.label)} style={s.label}>
          {copy.nameLabel}
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={copy.namePlaceholder}
          placeholderTextColorClassName="accent-muted-foreground"
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
            placeholder={copy.slugPlaceholder}
            placeholderTextColorClassName="accent-muted-foreground"
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
        disabled={submitting || name.trim().length === 0}
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
      {error !== null ? (
        <Text className={clsx("text-sm text-destructive mt-2", c.errorState)} style={s.errorState}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
