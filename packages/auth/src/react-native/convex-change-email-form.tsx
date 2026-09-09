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
  StyleSheet,
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
    <View style={[styles.root, s.root]}>
      <View style={[styles.header, s.header]}>
        <Text style={[styles.title, s.title]}>{copy.title}</Text>
        <Text style={[styles.description, s.description]}>{copy.description}</Text>
      </View>
      <View>
        {props.currentEmail !== null && props.currentEmail !== undefined ? (
          <View style={[styles.field, s.field]}>
            <Text style={[styles.label, s.label]}>{copy.currentEmailLabel}</Text>
            <TextInput
              value={props.currentEmail}
              editable={false}
              style={[styles.input, styles.readonlyInput, s.input, s.readonlyInput]}
            />
          </View>
        ) : null}
        <View style={[styles.field, s.field]}>
          <Text style={[styles.label, s.label]}>{copy.newEmailLabel}</Text>
          <TextInput
            value={newEmail}
            onChangeText={setNewEmail}
            placeholder={copy.newEmailPlaceholder}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            style={[styles.input, s.input]}
          />
        </View>
        <Pressable
          onPress={() => void handleSubmit()}
          disabled={isRequesting}
          style={[styles.submitButton, s.submitButton]}
        >
          <Text style={[styles.submitButtonText, s.submitButtonText]}>
            {isRequesting ? copy.submitting : copy.submit}
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
      </View>
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
  readonlyInput: { opacity: 0.6 },
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
  successState: { paddingHorizontal: 16, paddingTop: 8, fontSize: 13 },
  errorState: { paddingHorizontal: 16, paddingTop: 8, fontSize: 13 },
});
