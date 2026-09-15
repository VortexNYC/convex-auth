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
    <View className="w-full py-2" style={s.root}>
      <View className="px-4 pb-3" style={s.header}>
        <Text className="text-base font-semibold text-foreground" style={s.title}>
          {header.title}
        </Text>
        <Text className="text-sm text-muted-foreground mt-0.5" style={s.description}>
          {header.description}
        </Text>
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
  const s = args.stylesOverride;
  return (
    <View className="w-full py-2" style={s.root}>
      <Text className="text-destructive px-4 pt-2 text-sm" style={s.errorState}>
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
      <View className="px-4 py-2" style={s.field}>
        <Text className="text-sm text-muted-foreground mb-1" style={s.label}>
          {args.copy.passwordLabel}
        </Text>
        <TextInput
          value={args.password}
          onChangeText={args.onPasswordChange}
          placeholder={args.copy.passwordPlaceholder}
          autoCapitalize="none"
          autoComplete="password"
          secureTextEntry
          className="w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm"
          placeholderTextColorClassName="accent-muted-foreground"
          style={s.input}
        />
      </View>
      <Pressable
        onPress={() => void args.onSubmit()}
        disabled={args.isEnabling}
        className="mx-4 mt-3 px-3 py-2.5 rounded-md bg-primary items-center justify-center"
        style={s.submitButton}
      >
        <Text className="text-sm font-medium text-primary-foreground" style={s.submitButtonText}>
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
        <View className="items-center py-3" style={s.qr}>
          {args.renderQR(args.totpURI)}
        </View>
      ) : null}
      {args.secret !== null ? (
        <View className="px-4 py-2" style={s.field}>
          <Text className="text-sm text-muted-foreground mb-1" style={s.label}>
            {args.copy.secretLabel}
          </Text>
          <Text
            selectable
            className="text-base font-mono tracking-wide text-foreground"
            style={s.secret}
          >
            {args.secret}
          </Text>
        </View>
      ) : null}
      <View className="px-4 py-2" style={s.field}>
        <Text className="text-sm text-muted-foreground mb-1" style={s.label}>
          {args.copy.codeLabel}
        </Text>
        <TextInput
          value={args.code}
          onChangeText={args.onCodeChange}
          placeholder={args.copy.codePlaceholder}
          autoCapitalize="none"
          autoComplete="one-time-code"
          keyboardType="number-pad"
          className="w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm"
          placeholderTextColorClassName="accent-muted-foreground"
          style={s.input}
        />
      </View>
      <Pressable
        onPress={() => void args.onSubmit()}
        disabled={args.isVerifying}
        className="mx-4 mt-3 px-3 py-2.5 rounded-md bg-primary items-center justify-center"
        style={s.submitButton}
      >
        <Text className="text-sm font-medium text-primary-foreground" style={s.submitButtonText}>
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
      <View className="px-4 py-2 gap-1" style={s.backupCodes}>
        {args.backupCodes.map((backupCode) => (
          <Text
            key={backupCode}
            selectable
            className="text-base font-mono text-foreground"
            style={s.backupCode}
          >
            {backupCode}
          </Text>
        ))}
      </View>
      <Pressable
        onPress={() => args.onDone?.()}
        className="mx-4 mt-3 px-3 py-2.5 rounded-md bg-primary items-center justify-center"
        style={s.submitButton}
      >
        <Text className="text-sm font-medium text-primary-foreground" style={s.submitButtonText}>
          {args.copy.done}
        </Text>
      </Pressable>
    </View>
  );
}

function TwoFactorError(args: {
  error: string | null;
  stylesOverride: ExpoEnableTwoFactorFormStyles;
}) {
  const s = args.stylesOverride;
  return args.error === null ? null : (
    <Text className="text-destructive px-4 pt-2 text-sm" style={s.errorState}>
      {args.error}
    </Text>
  );
}
