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
    <View className="w-full py-2" style={s.root}>
      <View className="px-4 pb-3" style={s.header}>
        <Text className="text-base font-semibold" style={s.title}>
          {copy.title}
        </Text>
        <Text className="text-sm text-muted-foreground mt-0.5" style={s.description}>
          {copy.description}
        </Text>
      </View>
      <View>
        <View className="px-4 py-2" style={s.field}>
          <Text className="text-sm text-muted-foreground mb-1" style={s.label}>
            {copy.emailLabel}
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder={copy.emailPlaceholder}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            className="w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm"
            style={s.input}
          />
        </View>
        <Pressable
          onPress={() => void handleSubmit()}
          disabled={isRequesting}
          className="mx-4 mt-3 px-3 py-2.5 rounded-md border border-input items-center"
          style={s.submitButton}
        >
          <Text className="text-sm font-medium" style={s.submitButtonText}>
            {isRequesting ? copy.submitting : copy.submit}
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
    </View>
  );
}
