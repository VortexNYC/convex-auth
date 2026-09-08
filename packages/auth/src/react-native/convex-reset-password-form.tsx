/**
 * ConvexResetPasswordForm (RN) — drop-in "set a new password" form
 * for Expo consumers. Mirrors the web component's API.
 *
 * Consumer usage (on the screen the deep-link points at):
 *   <ConvexResetPasswordForm
 *     authClient={convexAuth.authClient}
 *     token={tokenFromDeepLink}
 *     onReset={() => router.replace('/sign-in')}
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
  useConvexAuthResetPassword,
  useConvexAuthClientContext,
  type ConvexBetterAuthClient,
} from "../react/client";

export type ExpoResetPasswordFormStyles = {
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

export type ExpoResetPasswordFormCopy = {
  title?: string;
  description?: string;
  passwordLabel?: string;
  confirmPasswordLabel?: string;
  submit?: string;
  submitting?: string;
  successMessage?: string;
  unavailable?: string;
  missingTokenMessage?: string;
  mismatchMessage?: string;
  minLengthMessage?: string;
};

export type ExpoResetPasswordFormProps = {
  authClient?: ConvexBetterAuthClient | null;
  token: string;
  minPasswordLength?: number;
  styles?: ExpoResetPasswordFormStyles;
  copy?: ExpoResetPasswordFormCopy;
  onReset?: () => void;
};

const DEFAULT_COPY: Required<ExpoResetPasswordFormCopy> = {
  title: "Set a new password",
  description: "Pick something you'll remember this time.",
  passwordLabel: "New password",
  confirmPasswordLabel: "Confirm new password",
  submit: "Set new password",
  submitting: "Saving…",
  successMessage: "Password updated. You can now sign in with your new password.",
  unavailable: "Password reset is not available on this auth client.",
  missingTokenMessage:
    "This reset link is missing or invalid. Request a new password reset email and try again.",
  mismatchMessage: "Passwords don't match.",
  minLengthMessage: "Password is too short.",
};

export function ConvexResetPasswordForm(props: ExpoResetPasswordFormProps) {
  const contextClient = useConvexAuthClientContext();
  const authClient = props.authClient ?? contextClient ?? null;
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const s = props.styles ?? {};
  const minLength = props.minPasswordLength ?? 12;
  const { resetPassword, isResetting } = useConvexAuthResetPassword(authClient);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasToken = props.token.length > 0;

  async function handleSubmit() {
    setSuccess(null);
    setError(null);
    if (password.length < minLength) {
      setError(`${copy.minLengthMessage} (minimum ${minLength} characters)`);
      return;
    }
    if (password !== confirm) {
      setError(copy.mismatchMessage);
      return;
    }
    const result = await resetPassword({
      newPassword: password,
      token: props.token,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(copy.successMessage);
    props.onReset?.();
  }

  return (
    <View style={[styles.root, s.root]}>
      <View style={[styles.header, s.header]}>
        <Text style={[styles.title, s.title]}>{copy.title}</Text>
        <Text style={[styles.description, s.description]}>{copy.description}</Text>
      </View>
      {!hasToken ? (
        <Text className="text-destructive" style={[styles.errorState, s.errorState]}>
          {copy.missingTokenMessage}
        </Text>
      ) : (
        <View>
          <View style={[styles.field, s.field]}>
            <Text style={[styles.label, s.label]}>{copy.passwordLabel}</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
              style={[styles.input, s.input]}
            />
          </View>
          <View style={[styles.field, s.field]}>
            <Text style={[styles.label, s.label]}>{copy.confirmPasswordLabel}</Text>
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
              style={[styles.input, s.input]}
            />
          </View>
          <Pressable
            onPress={() => void handleSubmit()}
            disabled={isResetting}
            style={[styles.submitButton, s.submitButton]}
          >
            <Text style={[styles.submitButtonText, s.submitButtonText]}>
              {isResetting ? copy.submitting : copy.submit}
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
      )}
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
