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
  Pressable,
  StyleSheet,
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
      <View style={[styles.root, s.root]}>
        <Text className="text-destructive" style={[styles.errorState, s.errorState]}>
          {copy.unavailable}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, s.root]}>
      <View style={[styles.header, s.header]}>
        <Text style={[styles.title, s.title]}>{copy.title}</Text>
        <Text style={[styles.description, s.description]}>{copy.description}</Text>
      </View>

      <View style={[styles.field, s.field]}>
        <Text style={[styles.label, s.label]}>
          {mode === "totp" ? copy.codeLabel : copy.backupCodeLabel}
        </Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder={mode === "totp" ? copy.codePlaceholder : copy.backupCodePlaceholder}
          autoCapitalize="none"
          autoComplete="one-time-code"
          keyboardType={mode === "totp" ? "number-pad" : "default"}
          style={[styles.input, s.input]}
        />
      </View>

      {showTrustDevice ? (
        <View style={[styles.trustToggle, s.trustToggle]}>
          <Switch value={trustDevice} onValueChange={setTrustDevice} />
          <Text style={[styles.trustToggleLabel, s.trustToggleLabel]}>{copy.trustDeviceLabel}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={() => void handleSubmit()}
        disabled={isVerifying}
        style={[styles.submitButton, s.submitButton]}
      >
        <Text style={[styles.submitButtonText, s.submitButtonText]}>
          {isVerifying ? copy.submitting : copy.submit}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => switchMode(mode === "totp" ? "backup" : "totp")}
        style={[styles.toggleButton, s.toggleButton]}
      >
        <Text style={[styles.toggleButtonText, s.toggleButtonText]}>
          {mode === "totp" ? copy.useBackupCode : copy.useAuthenticator}
        </Text>
      </Pressable>

      {error !== null ? (
        <Text className="text-destructive" style={[styles.errorState, s.errorState]}>
          {error}
        </Text>
      ) : null}
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
  trustToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  trustToggleLabel: { fontSize: 13, opacity: 0.8 },
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
  toggleButton: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  toggleButtonText: { fontSize: 13, opacity: 0.7 },
  errorState: { paddingHorizontal: 16, paddingTop: 8, fontSize: 13 },
});
