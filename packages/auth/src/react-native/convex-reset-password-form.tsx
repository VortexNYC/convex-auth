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
  useColorScheme,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { clsx } from "clsx";

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

export type ExpoResetPasswordFormClassNames = {
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
  classNames?: ExpoResetPasswordFormClassNames;
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
  const c = props.classNames ?? {};
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
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
      {!hasToken ? (
        <Text className={clsx("text-sm text-destructive mt-2", c.errorState)} style={s.errorState}>
          {copy.missingTokenMessage}
        </Text>
      ) : (
        <>
          <View className={clsx("w-full py-2", c.field)} style={s.field}>
            <Text className={clsx("text-sm text-muted-foreground mb-1", c.label)} style={s.label}>
              {copy.passwordLabel}
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={copy.passwordLabel}
              placeholderTextColorClassName="accent-muted-foreground"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              className={clsx(
                "w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm",
                c.input,
              )}
              style={s.input}
              accessibilityLabel={copy.passwordLabel}
            />
          </View>
          <View className={clsx("w-full py-2", c.field)} style={s.field}>
            <Text className={clsx("text-sm text-muted-foreground mb-1", c.label)} style={s.label}>
              {copy.confirmPasswordLabel}
            </Text>
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              placeholder={copy.confirmPasswordLabel}
              placeholderTextColorClassName="accent-muted-foreground"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              className={clsx(
                "w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm",
                c.input,
              )}
              style={s.input}
              accessibilityLabel={copy.confirmPasswordLabel}
            />
          </View>
          <Pressable
            onPress={() => void handleSubmit()}
            disabled={isResetting}
            className={clsx("w-full bg-primary rounded-md p-3 mt-4 items-center", c.submitButton)}
            style={s.submitButton}
            accessibilityRole="button"
            accessibilityLabel={isResetting ? copy.submitting : copy.submit}
          >
            <Text
              className={clsx("text-sm font-semibold text-primary-foreground", c.submitButtonText)}
              style={s.submitButtonText}
            >
              {isResetting ? copy.submitting : copy.submit}
            </Text>
          </Pressable>
          {success !== null ? (
            <Text
              className={clsx("text-sm text-muted-foreground mt-2", c.successState)}
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
      )}
    </View>
  );
}
