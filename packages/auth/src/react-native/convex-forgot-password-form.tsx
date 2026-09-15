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

export type ExpoForgotPasswordFormClassNames = {
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
  classNames?: ExpoForgotPasswordFormClassNames;
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
  const c = props.classNames ?? {};
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
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
      <View className={clsx("w-full", c.field)} style={s.field}>
        <Text className={clsx("text-sm text-muted-foreground mb-1", c.label)} style={s.label}>
          {copy.emailLabel}
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={copy.emailPlaceholder}
          placeholderTextColorClassName="accent-muted-foreground"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          className={clsx(
            "w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm",
            c.input,
          )}
          style={s.input}
          accessibilityLabel={copy.emailLabel}
        />
      </View>
      <Pressable
        onPress={() => void handleSubmit()}
        disabled={isRequesting}
        className={clsx("w-full bg-primary rounded-md p-3 mt-4 items-center", c.submitButton)}
        style={s.submitButton}
        accessibilityRole="button"
        accessibilityLabel={isRequesting ? copy.submitting : copy.submit}
      >
        <Text
          className={clsx("text-sm font-semibold text-primary-foreground", c.submitButtonText)}
          style={s.submitButtonText}
        >
          {isRequesting ? copy.submitting : copy.submit}
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
        <Text className={clsx("text-sm text-destructive mt-2", c.errorState)} style={s.errorState}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
