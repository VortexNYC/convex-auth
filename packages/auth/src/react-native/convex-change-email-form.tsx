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
  useColorScheme,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { clsx } from "clsx";

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

export type ExpoChangeEmailFormClassNames = {
  root?: string;
  header?: string;
  title?: string;
  description?: string;
  field?: string;
  label?: string;
  input?: string;
  readonlyInput?: string;
  submitButton?: string;
  submitButtonText?: string;
  successState?: string;
  errorState?: string;
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
  classNames?: ExpoChangeEmailFormClassNames;
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
  const c = props.classNames ?? {};
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
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
      {props.currentEmail !== null && props.currentEmail !== undefined ? (
        <View className={clsx("w-full py-2", c.field)} style={s.field}>
          <Text className={clsx("text-sm text-muted-foreground mb-1", c.label)} style={s.label}>
            {copy.currentEmailLabel}
          </Text>
          <TextInput
            value={props.currentEmail}
            editable={false}
            className={clsx(
              "w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm opacity-60",
              c.input,
              c.readonlyInput,
            )}
            style={[s.input, s.readonlyInput]}
            accessibilityLabel={copy.currentEmailLabel}
          />
        </View>
      ) : null}
      <View className={clsx("w-full py-2", c.field)} style={s.field}>
        <Text className={clsx("text-sm text-muted-foreground mb-1", c.label)} style={s.label}>
          {copy.newEmailLabel}
        </Text>
        <TextInput
          value={newEmail}
          onChangeText={setNewEmail}
          placeholder={copy.newEmailPlaceholder}
          placeholderTextColorClassName="text-muted-foreground"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          className={clsx(
            "w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm",
            c.input,
          )}
          style={s.input}
          accessibilityLabel={copy.newEmailLabel}
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
