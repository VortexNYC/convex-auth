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
    <View className="py-2" style={s.root}>
      <View className="px-4 pb-3" style={s.header}>
        <Text className="text-base font-semibold" style={s.title}>
          {copy.title}
        </Text>
        <Text className="text-sm text-muted-foreground mt-0.5" style={s.description}>
          {copy.description}
        </Text>
      </View>
      {!hasToken ? (
        <Text className="text-destructive px-4 pt-2 text-sm" style={s.errorState}>
          {copy.missingTokenMessage}
        </Text>
      ) : (
        <View>
          <View className="px-4 py-2" style={s.field}>
            <Text className="text-sm text-muted-foreground mb-1" style={s.label}>
              {copy.passwordLabel}
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
              className="w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm"
              style={s.input}
            />
          </View>
          <View className="px-4 py-2" style={s.field}>
            <Text className="text-sm text-muted-foreground mb-1" style={s.label}>
              {copy.confirmPasswordLabel}
            </Text>
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
              className="w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm"
              style={s.input}
            />
          </View>
          <Pressable
            onPress={() => void handleSubmit()}
            disabled={isResetting}
            className="mx-4 mt-3 px-3 py-2.5 rounded-md border border-input items-center"
            style={s.submitButton}
          >
            <Text className="text-sm font-medium" style={s.submitButtonText}>
              {isResetting ? copy.submitting : copy.submit}
            </Text>
          </Pressable>
          {success !== null ? (
            <Text className="px-4 pt-2 text-sm" style={s.successState}>
              {success}
            </Text>
          ) : null}
          {error !== null ? (
            <Text className="text-destructive px-4 pt-2 text-sm" style={s.errorState}>
              {error}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}
