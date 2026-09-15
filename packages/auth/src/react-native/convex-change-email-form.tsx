/**
 * ConvexChangeEmailForm (RN) — drop-in change-email form for Expo
 * consumers. Mirrors the web component.
 *
 * Consumer usage:
 *   <ConvexChangeEmailForm
 *     authClient={convexAuth.authClient}
 *     currentEmail={user?.email ?? null}
 *     verifyCallbackUrl="pile://verify-email"
 *   />
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

import {
  useConvexAuthChangeEmail,
  useConvexAuthClientContext,
  type ConvexBetterAuthClient,
} from "../react/client";

export type ExpoChangeEmailFormStyles = {
  root?: StyleProp<ViewStyle>;
  header?: StyleProp<ViewStyle>;
  title?: StyleProp<TextStyle>;
  description?: StyleProp<TextStyle>;
  field?: StyleProp<ViewStyle>;
  label?: StyleProp<TextStyle>;
  input?: StyleProp<TextStyle>;
  readonlyInput?: StyleProp<TextStyle>;
  submitButton?: StyleProp<ViewStyle>;
  submitButtonText?: StyleProp<TextStyle>;
  successState?: StyleProp<TextStyle>;
  errorState?: StyleProp<TextStyle>;
};

export type ExpoChangeEmailFormCopy = {
  title?: string;
  description?: string;
  currentEmailLabel?: string;
  newEmailLabel?: string;
  newEmailPlaceholder?: string;
  submit?: string;
  submitting?: string;
  successMessage?: string;
  unavailable?: string;
  sameAsCurrentMessage?: string;
};

export type ExpoChangeEmailFormProps = {
  authClient?: ConvexBetterAuthClient | null;
  currentEmail?: string | null;
  verifyCallbackUrl?: string;
  styles?: ExpoChangeEmailFormStyles;
  copy?: ExpoChangeEmailFormCopy;
  onRequested?: (newEmail: string) => void;
};

const DEFAULT_COPY: Required<ExpoChangeEmailFormCopy> = {
  title: "Change email",
  description: "We'll send a confirmation link to the new address.",
  currentEmailLabel: "Current email",
  newEmailLabel: "New email",
  newEmailPlaceholder: "new@example.com",
  submit: "Send confirmation",
  submitting: "Sending…",
  successMessage:
    "Confirmation email sent. Click the link from the new address to finish the change.",
  unavailable: "Email change is not available on this auth client.",
  sameAsCurrentMessage: "New email is the same as your current email.",
};

export function ConvexChangeEmailForm(props: ExpoChangeEmailFormProps) {
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const s = props.styles ?? {};
  const contextClient = useConvexAuthClientContext();
  const authClient = props.authClient ?? contextClient ?? null;
  const { requestChange, isRequesting } = useConvexAuthChangeEmail(authClient);
  const [newEmail, setNewEmail] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSuccess(null);
    setError(null);
    const trimmed = newEmail.trim();
    if (trimmed.length === 0) return;
    if (
      props.currentEmail !== null &&
      props.currentEmail !== undefined &&
      trimmed.toLowerCase() === props.currentEmail.toLowerCase()
    ) {
      setError(copy.sameAsCurrentMessage);
      return;
    }
    const result = await requestChange({
      newEmail: trimmed,
      callbackURL: props.verifyCallbackUrl,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(copy.successMessage);
    props.onRequested?.(trimmed);
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
      <View>
        {props.currentEmail !== null && props.currentEmail !== undefined ? (
          <View className="px-4 py-2" style={s.field}>
            <Text className="text-sm text-muted-foreground mb-1" style={s.label}>
              {copy.currentEmailLabel}
            </Text>
            <TextInput
              value={props.currentEmail}
              editable={false}
              className="w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm opacity-60"
              style={[s.input, s.readonlyInput]}
            />
          </View>
        ) : null}
        <View className="px-4 py-2" style={s.field}>
          <Text className="text-sm text-muted-foreground mb-1" style={s.label}>
            {copy.newEmailLabel}
          </Text>
          <TextInput
            value={newEmail}
            onChangeText={setNewEmail}
            placeholder={copy.newEmailPlaceholder}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            className="w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm"
            placeholderTextColorClassName="accent-muted-foreground"
            style={s.input}
          />
        </View>
        <Pressable
          onPress={() => void handleSubmit()}
          disabled={isRequesting}
          className="mx-4 mt-3 px-3 py-2.5 rounded-md bg-primary items-center justify-center"
          style={s.submitButton}
          accessibilityRole="button"
          accessibilityLabel={copy.submit}
        >
          <Text className="text-sm font-medium text-primary-foreground" style={s.submitButtonText}>
            {isRequesting ? copy.submitting : copy.submit}
          </Text>
        </Pressable>
        {success !== null ? (
          <Text className="px-4 pt-2 text-sm text-success" style={s.successState}>
            {success}
          </Text>
        ) : null}
        {error !== null ? (
          <Text className="text-destructive px-4 pt-2 text-sm" style={s.errorState}>
            {error}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
