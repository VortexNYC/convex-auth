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
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

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

  return (
    <View style={[styles.root, s.root]}>
      <View style={[styles.header, s.header]}>
        <Text style={[styles.title, s.title]}>{copy.title}</Text>
        <Text style={[styles.description, s.description]}>{copy.description}</Text>
      </View>
      {isAvailable ? (
        <View>
          <View style={[styles.field, s.field]}>
            <Text style={[styles.label, s.label]}>{copy.nameLabel}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              className="border-border"
              style={[styles.input, s.input]}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>
          {showImageField ? (
            <View style={[styles.field, s.field]}>
              <Text style={[styles.label, s.label]}>{copy.imageLabel}</Text>
              <TextInput
                value={image}
                onChangeText={setImage}
                className="border-border"
                style={[styles.input, s.input]}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>
          ) : null}
          <Pressable
            onPress={() => void handleSubmit()}
            disabled={isUpdating}
            style={[styles.submitButton, s.submitButton]}
          >
            <Text style={[styles.submitButtonText, s.submitButtonText]}>
              {isUpdating ? copy.submitting : copy.submit}
            </Text>
          </Pressable>
          {success !== null ? (
            <Text className="text-success" style={[styles.successState, s.successState]}>
              {success}
            </Text>
          ) : null}
          {error !== null ? (
            <Text className="text-destructive" style={[styles.errorState, s.errorState]}>
              {error}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text className="text-destructive" style={[styles.errorState, s.errorState]}>
          {copy.unavailable}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingVertical: 8 },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontSize: 16, fontWeight: "600" },
  description: { fontSize: 13, opacity: 0.6, marginTop: 2 },
  field: { paddingHorizontal: 16, paddingBottom: 12 },
  label: { fontSize: 12, opacity: 0.7, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  submitButton: {
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
  },
  submitButtonText: { fontSize: 14, fontWeight: "500" },
  successState: { paddingHorizontal: 16, paddingTop: 8, fontSize: 13 },
  errorState: { paddingHorizontal: 16, paddingTop: 8, fontSize: 13 },
});
