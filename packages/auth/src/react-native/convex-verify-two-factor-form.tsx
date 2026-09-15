/**
 * ConvexVerifyTwoFactorForm (RN) — drop-in 2FA step-up for sign-in.
 * Mirrors the web component: when `signIn.email` returns
 * `data.twoFactorRedirect`, render this to collect a TOTP code (default)
 * or a one-time backup code, then call `onVerified`.
 *
 * Consumer usage:
 *   <ConvexVerifyTwoFactorForm
 *     authClient={convexAuth.authClient}
 *     onVerified={() => router.replace('/app')}
 *   />
 */
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Switch,
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
  useConvexAuthVerifyBackupCode,
  useConvexAuthVerifyTotp,
  useConvexAuthClientContext,
  type ConvexBetterAuthClient,
} from "../react/client";

export type ExpoVerifyTwoFactorFormStyles = {
  root?: StyleProp<ViewStyle>;
  header?: StyleProp<ViewStyle>;
  title?: StyleProp<TextStyle>;
  description?: StyleProp<TextStyle>;
  field?: StyleProp<ViewStyle>;
  label?: StyleProp<TextStyle>;
  input?: StyleProp<TextStyle>;
  submitButton?: StyleProp<ViewStyle>;
  submitButtonText?: StyleProp<TextStyle>;
  toggleButton?: StyleProp<ViewStyle>;
  toggleButtonText?: StyleProp<TextStyle>;
  trustToggle?: StyleProp<ViewStyle>;
  trustToggleLabel?: StyleProp<TextStyle>;
  errorState?: StyleProp<TextStyle>;
};

export type ExpoVerifyTwoFactorFormClassNames = {
  root?: string;
  header?: string;
  title?: string;
  description?: string;
  field?: string;
  label?: string;
  input?: string;
  submitButton?: string;
  submitButtonText?: string;
  toggleButton?: string;
  toggleButtonText?: string;
  trustToggle?: string;
  trustToggleLabel?: string;
  errorState?: string;
};

export type ExpoVerifyTwoFactorFormCopy = {
  title?: string;
  description?: string;
  codeLabel?: string;
  codePlaceholder?: string;
  backupCodeLabel?: string;
  backupCodePlaceholder?: string;
  submit?: string;
  submitting?: string;
  useBackupCode?: string;
  useAuthenticator?: string;
  trustDeviceLabel?: string;
  unavailable?: string;
};

export type ExpoVerifyTwoFactorFormProps = {
  authClient?: ConvexBetterAuthClient | null;
  showTrustDevice?: boolean;
  styles?: ExpoVerifyTwoFactorFormStyles;
  classNames?: ExpoVerifyTwoFactorFormClassNames;
  copy?: ExpoVerifyTwoFactorFormCopy;
  onVerified?: () => void;
};

const DEFAULT_COPY: Required<ExpoVerifyTwoFactorFormCopy> = {
  title: "Two-factor authentication",
  description: "Enter the 6-digit code from your authenticator app.",
  codeLabel: "Authentication code",
  codePlaceholder: "123456",
  backupCodeLabel: "Backup code",
  backupCodePlaceholder: "xxxxx-xxxxx",
  submit: "Verify",
  submitting: "Verifying…",
  useBackupCode: "Use a backup code",
  useAuthenticator: "Use authenticator app",
  trustDeviceLabel: "Trust this device for 60 days",
  unavailable: "Two-factor authentication is not available on this auth client.",
};

type Mode = "totp" | "backup";

export function ConvexVerifyTwoFactorForm(props: ExpoVerifyTwoFactorFormProps) {
  const contextClient = useConvexAuthClientContext();
  const authClient = props.authClient ?? contextClient ?? null;
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const s = props.styles ?? {};
  const c = props.classNames ?? {};
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const showTrustDevice = props.showTrustDevice ?? true;

  const { verifyTotp, isVerifying: isVerifyingTotp } = useConvexAuthVerifyTotp(authClient);
  const { verifyBackupCode, isVerifying: isVerifyingBackup } =
    useConvexAuthVerifyBackupCode(authClient);

  const [mode, setMode] = useState<Mode>("totp");
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAvailable = authClient !== null;
  const isVerifying = isVerifyingTotp || isVerifyingBackup;

  async function handleSubmit() {
    setError(null);
    const trimmed = code.trim();
    if (trimmed.length === 0) return;
    const result =
      mode === "totp"
        ? await verifyTotp({ code: trimmed, trustDevice })
        : await verifyBackupCode({ code: trimmed, trustDevice });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    props.onVerified?.();
  }

  function switchMode(next: Mode) {
    setMode(next);
    setCode("");
    setError(null);
  }

  const rootClassName = clsx(
    "w-full max-w-md self-center p-4 bg-background",
    c.root,
    isDark && "dark",
  );

  if (!isAvailable) {
    return (
      <View className={rootClassName} style={s.root}>
        <Text className={clsx("text-sm text-destructive mt-2", c.errorState)} style={s.errorState}>
          {copy.unavailable}
        </Text>
      </View>
    );
  }

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

      <View className={clsx("w-full py-2", c.field)} style={s.field}>
        <Text className={clsx("text-sm text-muted-foreground mb-1", c.label)} style={s.label}>
          {mode === "totp" ? copy.codeLabel : copy.backupCodeLabel}
        </Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder={mode === "totp" ? copy.codePlaceholder : copy.backupCodePlaceholder}
          placeholderTextColorClassName="accent-muted-foreground"
          autoCapitalize="none"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          keyboardType={mode === "totp" ? "number-pad" : "default"}
          className={clsx(
            "w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm",
            c.input,
          )}
          style={s.input}
          accessibilityLabel={mode === "totp" ? copy.codeLabel : copy.backupCodeLabel}
        />
      </View>

      {showTrustDevice ? (
        <View
          className={clsx("flex-row items-center gap-2 py-2", c.trustToggle)}
          style={s.trustToggle}
        >
          <Switch value={trustDevice} onValueChange={setTrustDevice} />
          <Text
            className={clsx("text-sm text-muted-foreground", c.trustToggleLabel)}
            style={s.trustToggleLabel}
          >
            {copy.trustDeviceLabel}
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={() => void handleSubmit()}
        disabled={isVerifying}
        className={clsx("w-full bg-primary rounded-md p-3 mt-4 items-center", c.submitButton)}
        style={s.submitButton}
        accessibilityRole="button"
        accessibilityLabel={isVerifying ? copy.submitting : copy.submit}
      >
        {isVerifying ? (
          <ActivityIndicator colorClassName="text-primary-foreground" />
        ) : (
          <Text
            className={clsx("text-sm font-semibold text-primary-foreground", c.submitButtonText)}
            style={s.submitButtonText}
          >
            {copy.submit}
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => switchMode(mode === "totp" ? "backup" : "totp")}
        className={clsx("w-full mt-2 py-2 items-center", c.toggleButton)}
        style={s.toggleButton}
        accessibilityRole="button"
        accessibilityLabel={mode === "totp" ? copy.useBackupCode : copy.useAuthenticator}
      >
        <Text
          className={clsx("text-sm text-muted-foreground", c.toggleButtonText)}
          style={s.toggleButtonText}
        >
          {mode === "totp" ? copy.useBackupCode : copy.useAuthenticator}
        </Text>
      </Pressable>

      {error !== null ? (
        <Text className={clsx("text-sm text-destructive mt-2", c.errorState)} style={s.errorState}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
