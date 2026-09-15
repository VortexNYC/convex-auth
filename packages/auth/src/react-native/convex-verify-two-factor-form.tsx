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
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

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

  if (!isAvailable) {
    return (
      <View className="w-full py-2" style={s.root}>
        <Text className="text-destructive px-4 pt-2 text-sm" style={s.errorState}>
          {copy.unavailable}
        </Text>
      </View>
    );
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

      <View className="px-4 py-2" style={s.field}>
        <Text className="text-sm text-muted-foreground mb-1" style={s.label}>
          {mode === "totp" ? copy.codeLabel : copy.backupCodeLabel}
        </Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder={mode === "totp" ? copy.codePlaceholder : copy.backupCodePlaceholder}
          autoCapitalize="none"
          autoComplete="one-time-code"
          keyboardType={mode === "totp" ? "number-pad" : "default"}
          className="w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm"
          placeholderTextColorClassName="accent-muted-foreground"
          style={s.input}
        />
      </View>

      {showTrustDevice ? (
        <View className="flex-row items-center gap-2 px-4 py-2" style={s.trustToggle}>
          <Switch value={trustDevice} onValueChange={setTrustDevice} />
          <Text className="text-sm text-muted-foreground" style={s.trustToggleLabel}>
            {copy.trustDeviceLabel}
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={() => void handleSubmit()}
        disabled={isVerifying}
        className="mx-4 mt-3 px-3 py-2.5 rounded-md bg-primary items-center justify-center"
        style={s.submitButton}
        accessibilityRole="button"
        accessibilityLabel={copy.submit}
      >
        {isVerifying ? (
          <ActivityIndicator colorClassName="accent-primary-foreground" />
        ) : (
          <Text className="text-sm font-medium text-primary-foreground" style={s.submitButtonText}>
            {copy.submit}
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => switchMode(mode === "totp" ? "backup" : "totp")}
        className="mx-4 mt-2 py-2 items-center"
        style={s.toggleButton}
      >
        <Text className="text-sm text-muted-foreground" style={s.toggleButtonText}>
          {mode === "totp" ? copy.useBackupCode : copy.useAuthenticator}
        </Text>
      </Pressable>

      {error !== null ? (
        <Text className="text-destructive px-4 pt-2 text-sm" style={s.errorState}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
