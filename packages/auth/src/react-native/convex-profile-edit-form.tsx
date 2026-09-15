/**
 * ConvexProfileEditForm (RN) — drop-in profile editor for Expo
 * consumers. Mirrors the web component's API + behavior. Uses RN
 * primitives (View/Text/TextInput/Pressable).
 *
 * Consumer usage:
 *   <ConvexProfileEditForm
 *     authClient={convexAuth.authClient}
 *     initialName={user?.name ?? ''}
 *     onUpdated={() => router.replace(router.canGoBack() ? '..' : '/')}
 *   />
 *
 * Same API as the web version. Styles go through the `styles` prop
 * (RN style objects) — RN convention.
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

import {
  useConvexAuthUpdateProfile,
  useConvexAuthClientContext,
  type ConvexBetterAuthClient,
} from "../react/client";

export type ExpoProfileEditFormStyles = {
  root?: StyleProp<ViewStyle>;
  header?: StyleProp<ViewStyle>;
  title?: StyleProp<TextStyle>;
  description?: StyleProp<TextStyle>;
  field?: StyleProp<ViewStyle>;
  label?: StyleProp<TextStyle>;
  input?: StyleProp<TextStyle>;
  submitButton?: StyleProp<ViewStyle>;
  submitButtonText?: StyleProp<TextStyle>;
  successState?: StyleProp<TextStyle>;
  errorState?: StyleProp<TextStyle>;
};

export type ExpoProfileEditFormClassNames = {
  root?: string;
  header?: string;
  title?: string;
  description?: string;
  field?: string;
  label?: string;
  input?: string;
  submitButton?: string;
  submitButtonText?: string;
  successState?: string;
  errorState?: string;
};

export type ExpoProfileEditFormCopy = {
  title?: string;
  description?: string;
  nameLabel?: string;
  imageLabel?: string;
  submit?: string;
  submitting?: string;
  successMessage?: string;
  unavailable?: string;
};

export type ExpoProfileEditFormProps = {
  authClient?: ConvexBetterAuthClient | null;
  initialName?: string;
  initialImage?: string;
  showImageField?: boolean;
  styles?: ExpoProfileEditFormStyles;
  classNames?: ExpoProfileEditFormClassNames;
  copy?: ExpoProfileEditFormCopy;
  onUpdated?: (next: { name?: string; image?: string }) => void;
};

const DEFAULT_COPY: Required<ExpoProfileEditFormCopy> = {
  title: "Profile",
  description: "Update your display name and avatar.",
  nameLabel: "Display name",
  imageLabel: "Avatar URL",
  submit: "Save profile",
  submitting: "Saving…",
  successMessage: "Profile updated.",
  unavailable: "Profile update is not available on this auth client.",
};

export function ConvexProfileEditForm(props: ExpoProfileEditFormProps) {
  const contextClient = useConvexAuthClientContext();
  const authClient = props.authClient ?? contextClient ?? null;
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const s = props.styles ?? {};
  const c = props.classNames ?? {};
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const { updateProfile, isUpdating } = useConvexAuthUpdateProfile(authClient);
  const [name, setName] = useState(props.initialName ?? "");
  const [image, setImage] = useState(props.initialImage ?? "");
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showImageField = props.showImageField ?? true;
  const isAvailable = authClient?.updateUser !== undefined;

  async function handleSubmit() {
    setSuccess(null);
    setError(null);
    const trimmedName = name.trim();
    const trimmedImage = image.trim();
    const args: { name?: string; image?: string } = {};
    if (trimmedName !== (props.initialName ?? "").trim()) args.name = trimmedName;
    if (showImageField && trimmedImage !== (props.initialImage ?? "").trim()) {
      args.image = trimmedImage;
    }
    if (Object.keys(args).length === 0) {
      setSuccess(copy.successMessage);
      return;
    }
    const result = await updateProfile(args);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(copy.successMessage);
    props.onUpdated?.(args);
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
      {isAvailable ? (
        <>
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
              autoComplete="name"
              textContentType="name"
              className={clsx(
                "w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm",
                c.input,
              )}
              style={s.input}
              accessibilityLabel={copy.nameLabel}
            />
          </View>
          {showImageField ? (
            <View className={clsx("w-full py-2", c.field)} style={s.field}>
              <Text className={clsx("text-sm text-muted-foreground mb-1", c.label)} style={s.label}>
                {copy.imageLabel}
              </Text>
              <TextInput
                value={image}
                onChangeText={setImage}
                placeholder={copy.imageLabel}
                placeholderTextColorClassName="text-muted-foreground"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                keyboardType="url"
                className={clsx(
                  "w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm",
                  c.input,
                )}
                style={s.input}
                accessibilityLabel={copy.imageLabel}
              />
            </View>
          ) : null}
          <Pressable
            onPress={() => void handleSubmit()}
            disabled={isUpdating}
            className={clsx("w-full bg-primary rounded-md p-3 mt-4 items-center", c.submitButton)}
            style={s.submitButton}
            accessibilityRole="button"
            accessibilityLabel={isUpdating ? copy.submitting : copy.submit}
          >
            <Text
              className={clsx("text-sm font-semibold text-primary-foreground", c.submitButtonText)}
              style={s.submitButtonText}
            >
              {isUpdating ? copy.submitting : copy.submit}
            </Text>
          </Pressable>
          {success !== null ? (
            <Text
              className={clsx("text-sm text-success mt-2", c.successState)}
              style={s.successState}
            >
              {success}
            </Text>
          ) : null}
          {error !== null ? (
            <Text
              className={clsx("text-sm text-destructive mt-2", c.errorState)}
              style={s.errorState}
            >
              {error}
            </Text>
          ) : null}
        </>
      ) : (
        <Text className={clsx("text-sm text-destructive mt-2", c.errorState)} style={s.errorState}>
          {copy.unavailable}
        </Text>
      )}
    </View>
  );
}
