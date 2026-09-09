/**
 * ConvexForgotPasswordForm (RN) — drop-in "request a password reset
 * email" form for Expo consumers. Mirrors the web component's API.
 *
 * Consumer usage:
 *   <ConvexForgotPasswordForm
 *     authClient={convexAuth.authClient}
 *     resetPasswordUrl="pile://reset-password"
 *   />
 *
 * Always shows a generic success message after submit (whether or not
 * the email is registered) — avoids address enumeration.
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
  useConvexAuthForgotPassword,
  useConvexAuthClientContext,
  type ConvexBetterAuthClient,
} from "../react/client";

export type ExpoForgotPasswordFormStyles = {
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

export type ExpoForgotPasswordFormCopy = {
  title?: string;
  description?: string;
  emailLabel?: string;
  emailPlaceholder?: string;
  submit?: string;
  submitting?: string;
  successMessage?: string;
  unavailable?: string;
};

export type ExpoForgotPasswordFormProps = {
  authClient?: ConvexBetterAuthClient | null;
  resetPasswordUrl: string;
  styles?: ExpoForgotPasswordFormStyles;
  copy?: ExpoForgotPasswordFormCopy;
  onRequested?: (email: string) => void;
};

const DEFAULT_COPY: Required<ExpoForgotPasswordFormCopy> = {
  title: "Forgot your password?",
  description: "Enter your email and we'll send you a reset link.",
  emailLabel: "Email",
  emailPlaceholder: "you@example.com",
  submit: "Send reset link",
  submitting: "Sending…",
  successMessage:
    "If an account exists for that email, you'll receive a password reset link shortly.",
  unavailable: "Password recovery is not available on this auth client.",
};

export function ConvexForgotPasswordForm(props: ExpoForgotPasswordFormProps) {
  const contextClient = useConvexAuthClientContext();
  const authClient = props.authClient ?? contextClient ?? null;
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const s = props.styles ?? {};
  const { requestReset, isRequesting } = useConvexAuthForgotPassword(authClient);
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSuccess(null);
    setError(null);
    const trimmed = email.trim();
    if (trimmed.length === 0) return;
    const result = await requestReset({
      email: trimmed,
      redirectTo: props.resetPasswordUrl,
    });
    if (!result.ok) {
      // Surface a real unavailable error; otherwise show generic
      // success (avoid email enumeration).
      if (result.error === "Password recovery is not available on this auth client") {
        setError(result.error);
        return;
      }
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
        <View style={[styles.field, s.field]}>
          <Text style={[styles.label, s.label]}>{copy.emailLabel}</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder={copy.emailPlaceholder}
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
