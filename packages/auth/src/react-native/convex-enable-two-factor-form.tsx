/**
 * ConvexEnableTwoFactorForm (RN) — drop-in TOTP enrollment flow for Expo.
 * Mirrors the web component: password → verify (secret + optional QR via
 * `renderQR`) → backup codes. Ships NO QR dependency; manual-entry of the
 * secret is always a complete path, and `renderQR` (e.g. a
 * react-native-qrcode-svg) adds the scan affordance when wanted.
 *
 * Consumer usage:
 *   <ConvexEnableTwoFactorForm
 *     authClient={convexAuth.authClient}
 *     issuer="Pile"
 *     renderQR={(uri) => <QRCode value={uri} size={180} />}
 *     onEnrolled={() => router.replace('/settings/security')}
 *   />
 */
import { useState, type ReactNode } from "react";
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
  extractTotpSecret,
  useConvexAuthEnableTwoFactor,
  useConvexAuthVerifyTotp,
  useConvexAuthClientContext,
  type ConvexBetterAuthClient,
} from "../react/client";

export type ExpoEnableTwoFactorFormStyles = {
  root?: StyleProp<ViewStyle>;
  header?: StyleProp<ViewStyle>;
  title?: StyleProp<TextStyle>;
  description?: StyleProp<TextStyle>;
  field?: StyleProp<ViewStyle>;
  label?: StyleProp<TextStyle>;
  input?: StyleProp<TextStyle>;
  submitButton?: StyleProp<ViewStyle>;
  submitButtonText?: StyleProp<TextStyle>;
  secret?: StyleProp<TextStyle>;
  qr?: StyleProp<ViewStyle>;
  backupCodes?: StyleProp<ViewStyle>;
  backupCode?: StyleProp<TextStyle>;
  errorState?: StyleProp<TextStyle>;
};

export type ExpoEnableTwoFactorFormCopy = {
  title?: string;
  description?: string;
  passwordLabel?: string;
  passwordPlaceholder?: string;
  passwordSubmit?: string;
  verifyTitle?: string;
  verifyDescription?: string;
  secretLabel?: string;
  codeLabel?: string;
  codePlaceholder?: string;
  verifySubmit?: string;
  submitting?: string;
  backupTitle?: string;
  backupDescription?: string;
  done?: string;
  unavailable?: string;
};

export type ExpoEnableTwoFactorFormProps = {
  authClient?: ConvexBetterAuthClient | null;
  issuer?: string;
  renderQR?: (totpURI: string) => ReactNode;
  styles?: ExpoEnableTwoFactorFormStyles;
  copy?: ExpoEnableTwoFactorFormCopy;
  onEnrolled?: () => void;
};

const DEFAULT_COPY: Required<ExpoEnableTwoFactorFormCopy> = {
  title: "Enable two-factor authentication",
  description: "Add an authenticator app for an extra layer of security.",
  passwordLabel: "Confirm your password",
  passwordPlaceholder: "Your password",
  passwordSubmit: "Continue",
  verifyTitle: "Scan the QR code",
  verifyDescription:
    "Scan the code with your authenticator app, or enter the setup key manually, then enter the 6-digit code.",
  secretLabel: "Setup key",
  codeLabel: "6-digit code",
  codePlaceholder: "123456",
  verifySubmit: "Verify & enable",
  submitting: "Working…",
  backupTitle: "Save your backup codes",
  backupDescription:
    "Store these somewhere safe. Each code works once if you lose access to your authenticator. They won't be shown again.",
  done: "Done",
  unavailable: "Two-factor authentication is not available on this auth client.",
};

type Step = "password" | "verify" | "backup";
type TwoFactorFormCopy = Required<ExpoEnableTwoFactorFormCopy>;

export function ConvexEnableTwoFactorForm(props: ExpoEnableTwoFactorFormProps) {
  const contextClient = useConvexAuthClientContext();
  const authClient = props.authClient ?? contextClient ?? null;
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const s = props.styles ?? {};

  const { enable, isEnabling } = useConvexAuthEnableTwoFactor(authClient);
  const { verifyTotp, isVerifying } = useConvexAuthVerifyTotp(authClient);

  const [step, setStep] = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [totpURI, setTotpURI] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isAvailable = authClient !== null;
  const secret = totpURI === null ? null : extractTotpSecret(totpURI);
  const header = getTwoFactorHeader(copy, step);

  async function handlePassword() {
    setError(null);
    if (password.length === 0) return;
    const result = await enable({ password, issuer: props.issuer });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTotpURI(result.totpURI);
    setBackupCodes(result.backupCodes ?? []);
    setStep("verify");
  }

  async function handleVerify() {
    setError(null);
    const trimmed = code.trim();
    if (trimmed.length === 0) return;
    const result = await verifyTotp({ code: trimmed });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStep("backup");
  }

  if (!isAvailable) {
    return <TwoFactorUnavailable copy={copy} stylesOverride={s} />;
  }

  return (
    <View style={[styles.root, s.root]}>
      <View style={[styles.header, s.header]}>
        <Text style={[styles.title, s.title]}>{header.title}</Text>
        <Text style={[styles.description, s.description]}>{header.description}</Text>
      </View>

      {step === "password" ? (
        <TwoFactorPasswordStep
          copy={copy}
          error={error}
          isEnabling={isEnabling}
          onPasswordChange={setPassword}
          onSubmit={handlePassword}
          password={password}
          stylesOverride={s}
        />
      ) : null}

      {step === "verify" ? (
        <TwoFactorVerifyStep
          code={code}
          copy={copy}
          error={error}
          isVerifying={isVerifying}
          onCodeChange={setCode}
          onSubmit={handleVerify}
          renderQR={props.renderQR}
          secret={secret}
          stylesOverride={s}
          totpURI={totpURI}
        />
      ) : null}

      {step === "backup" ? (
        <TwoFactorBackupStep
          backupCodes={backupCodes}
          copy={copy}
          onDone={props.onEnrolled}
          stylesOverride={s}
        />
      ) : null}
    </View>
  );
}

function getTwoFactorHeader(copy: TwoFactorFormCopy, step: Step) {
  if (step === "verify") {
    return { title: copy.verifyTitle, description: copy.verifyDescription };
  }
  if (step === "backup") {
    return { title: copy.backupTitle, description: copy.backupDescription };
  }
  return { title: copy.title, description: copy.description };
}

function TwoFactorUnavailable(args: {
  copy: TwoFactorFormCopy;
  stylesOverride: ExpoEnableTwoFactorFormStyles;
}) {
  return (
    <View style={[styles.root, args.stylesOverride.root]}>
      <Text
        className="text-destructive"
        style={[styles.errorState, args.stylesOverride.errorState]}
      >
        {args.copy.unavailable}
      </Text>
    </View>
  );
}

function TwoFactorPasswordStep(args: {
  copy: TwoFactorFormCopy;
  error: string | null;
  isEnabling: boolean;
  onPasswordChange: (value: string) => void;
  onSubmit: () => Promise<void>;
  password: string;
  stylesOverride: ExpoEnableTwoFactorFormStyles;
}) {
  const s = args.stylesOverride;
  return (
    <View>
      <View style={[styles.field, s.field]}>
        <Text style={[styles.label, s.label]}>{args.copy.passwordLabel}</Text>
        <TextInput
          value={args.password}
          onChangeText={args.onPasswordChange}
          placeholder={args.copy.passwordPlaceholder}
          autoCapitalize="none"
          autoComplete="password"
          secureTextEntry
          style={[styles.input, s.input]}
        />
      </View>
      <Pressable
        onPress={() => void args.onSubmit()}
        disabled={args.isEnabling}
        style={[styles.submitButton, s.submitButton]}
      >
        <Text style={[styles.submitButtonText, s.submitButtonText]}>
          {args.isEnabling ? args.copy.submitting : args.copy.passwordSubmit}
        </Text>
      </Pressable>
      <TwoFactorError error={args.error} stylesOverride={s} />
    </View>
  );
}

function TwoFactorVerifyStep(args: {
  code: string;
  copy: TwoFactorFormCopy;
  error: string | null;
  isVerifying: boolean;
  onCodeChange: (value: string) => void;
  onSubmit: () => Promise<void>;
  renderQR?: (totpURI: string) => ReactNode;
  secret: string | null;
  stylesOverride: ExpoEnableTwoFactorFormStyles;
  totpURI: string | null;
}) {
  const s = args.stylesOverride;
  return (
    <View>
      {args.totpURI !== null && args.renderQR !== undefined ? (
        <View style={[styles.qr, s.qr]}>{args.renderQR(args.totpURI)}</View>
      ) : null}
      {args.secret !== null ? (
        <View style={[styles.field, s.field]}>
          <Text style={[styles.label, s.label]}>{args.copy.secretLabel}</Text>
          <Text selectable style={[styles.secret, s.secret]}>
            {args.secret}
          </Text>
        </View>
      ) : null}
      <View style={[styles.field, s.field]}>
        <Text style={[styles.label, s.label]}>{args.copy.codeLabel}</Text>
        <TextInput
          value={args.code}
          onChangeText={args.onCodeChange}
          placeholder={args.copy.codePlaceholder}
          autoCapitalize="none"
          autoComplete="one-time-code"
          keyboardType="number-pad"
          style={[styles.input, s.input]}
        />
      </View>
      <Pressable
        onPress={() => void args.onSubmit()}
        disabled={args.isVerifying}
        style={[styles.submitButton, s.submitButton]}
      >
        <Text style={[styles.submitButtonText, s.submitButtonText]}>
          {args.isVerifying ? args.copy.submitting : args.copy.verifySubmit}
        </Text>
      </Pressable>
      <TwoFactorError error={args.error} stylesOverride={s} />
    </View>
  );
}

function TwoFactorBackupStep(args: {
  backupCodes: string[];
  copy: TwoFactorFormCopy;
  onDone?: () => void;
  stylesOverride: ExpoEnableTwoFactorFormStyles;
}) {
  const s = args.stylesOverride;
  return (
    <View>
      <View style={[styles.backupCodes, s.backupCodes]}>
        {args.backupCodes.map((backupCode) => (
          <Text key={backupCode} selectable style={[styles.backupCode, s.backupCode]}>
            {backupCode}
          </Text>
        ))}
      </View>
      <Pressable onPress={() => args.onDone?.()} style={[styles.submitButton, s.submitButton]}>
        <Text style={[styles.submitButtonText, s.submitButtonText]}>{args.copy.done}</Text>
      </Pressable>
    </View>
  );
}

function TwoFactorError(args: {
  error: string | null;
  stylesOverride: ExpoEnableTwoFactorFormStyles;
}) {
  return args.error === null ? null : (
    <Text className="text-destructive" style={[styles.errorState, args.stylesOverride.errorState]}>
      {args.error}
    </Text>
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
  secret: {
    fontSize: 15,
    fontFamily: "Courier",
    letterSpacing: 1,
  },
  qr: { alignItems: "center", paddingVertical: 12 },
  backupCodes: { paddingHorizontal: 16, paddingVertical: 8, gap: 4 },
  backupCode: { fontSize: 15, fontFamily: "Courier" },
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
  errorState: { paddingHorizontal: 16, paddingTop: 8, fontSize: 13 },
});
