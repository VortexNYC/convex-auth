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
  useColorScheme,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { clsx } from "clsx";

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

export type ExpoEnableTwoFactorFormClassNames = {
  root?: string;
  header?: string;
  title?: string;
  description?: string;
  field?: string;
  label?: string;
  input?: string;
  submitButton?: string;
  submitButtonText?: string;
  secret?: string;
  qr?: string;
  backupCodes?: string;
  backupCode?: string;
  errorState?: string;
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
  classNames?: ExpoEnableTwoFactorFormClassNames;
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
  const c = props.classNames ?? {};
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

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
          {header.title}
        </Text>
        <Text
          className={clsx("text-sm text-muted-foreground", c.description)}
          style={s.description}
        >
          {header.description}
        </Text>
      </View>

      {step === "password" ? (
        <TwoFactorPasswordStep
          copy={copy}
          classNames={c}
          error={error}
          isEnabling={isEnabling}
          onPasswordChange={setPassword}
          onSubmit={handlePassword}
          password={password}
          styles={s}
        />
      ) : null}

      {step === "verify" ? (
        <TwoFactorVerifyStep
          classNames={c}
          code={code}
          copy={copy}
          error={error}
          isVerifying={isVerifying}
          onCodeChange={setCode}
          onSubmit={handleVerify}
          renderQR={props.renderQR}
          secret={secret}
          styles={s}
          totpURI={totpURI}
        />
      ) : null}

      {step === "backup" ? (
        <TwoFactorBackupStep
          backupCodes={backupCodes}
          classNames={c}
          copy={copy}
          onDone={props.onEnrolled}
          styles={s}
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

function TwoFactorPasswordStep(args: {
  copy: TwoFactorFormCopy;
  classNames: ExpoEnableTwoFactorFormClassNames;
  error: string | null;
  isEnabling: boolean;
  onPasswordChange: (value: string) => void;
  onSubmit: () => Promise<void>;
  password: string;
  styles: ExpoEnableTwoFactorFormStyles;
}) {
  const s = args.styles;
  const c = args.classNames;
  return (
    <View className="w-full">
      <View className={clsx("w-full py-2", c.field)} style={s.field}>
        <Text className={clsx("text-sm text-muted-foreground mb-1", c.label)} style={s.label}>
          {args.copy.passwordLabel}
        </Text>
        <TextInput
          value={args.password}
          onChangeText={args.onPasswordChange}
          placeholder={args.copy.passwordPlaceholder}
          placeholderTextColorClassName="text-muted-foreground"
          autoCapitalize="none"
          autoComplete="password"
          textContentType="password"
          secureTextEntry
          className={clsx(
            "w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm",
            c.input,
          )}
          style={s.input}
          accessibilityLabel={args.copy.passwordLabel}
        />
      </View>
      <Pressable
        onPress={() => void args.onSubmit()}
        disabled={args.isEnabling}
        className={clsx("w-full bg-primary rounded-md p-3 mt-4 items-center", c.submitButton)}
        style={s.submitButton}
        accessibilityRole="button"
        accessibilityLabel={args.isEnabling ? args.copy.submitting : args.copy.passwordSubmit}
      >
        <Text
          className={clsx("text-sm font-semibold text-primary-foreground", c.submitButtonText)}
          style={s.submitButtonText}
        >
          {args.isEnabling ? args.copy.submitting : args.copy.passwordSubmit}
        </Text>
      </Pressable>
      <TwoFactorError classNames={c} error={args.error} styles={s} />
    </View>
  );
}

function TwoFactorVerifyStep(args: {
  classNames: ExpoEnableTwoFactorFormClassNames;
  code: string;
  copy: TwoFactorFormCopy;
  error: string | null;
  isVerifying: boolean;
  onCodeChange: (value: string) => void;
  onSubmit: () => Promise<void>;
  renderQR?: (totpURI: string) => ReactNode;
  secret: string | null;
  styles: ExpoEnableTwoFactorFormStyles;
  totpURI: string | null;
}) {
  const s = args.styles;
  const c = args.classNames;
  return (
    <View className="w-full">
      {args.totpURI !== null && args.renderQR !== undefined ? (
        <View className={clsx("items-center py-3", c.qr)} style={s.qr}>
          {args.renderQR(args.totpURI)}
        </View>
      ) : null}
      {args.secret !== null ? (
        <View className={clsx("w-full py-2", c.field)} style={s.field}>
          <Text className={clsx("text-sm text-muted-foreground mb-1", c.label)} style={s.label}>
            {args.copy.secretLabel}
          </Text>
          <Text
            selectable
            className={clsx("text-base font-mono tracking-wide text-foreground", c.secret)}
            style={s.secret}
          >
            {args.secret}
          </Text>
        </View>
      ) : null}
      <View className={clsx("w-full py-2", c.field)} style={s.field}>
        <Text className={clsx("text-sm text-muted-foreground mb-1", c.label)} style={s.label}>
          {args.copy.codeLabel}
        </Text>
        <TextInput
          value={args.code}
          onChangeText={args.onCodeChange}
          placeholder={args.copy.codePlaceholder}
          placeholderTextColorClassName="text-muted-foreground"
          autoCapitalize="none"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          keyboardType="number-pad"
          className={clsx(
            "w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm",
            c.input,
          )}
          style={s.input}
          accessibilityLabel={args.copy.codeLabel}
        />
      </View>
      <Pressable
        onPress={() => void args.onSubmit()}
        disabled={args.isVerifying}
        className={clsx("w-full bg-primary rounded-md p-3 mt-4 items-center", c.submitButton)}
        style={s.submitButton}
        accessibilityRole="button"
        accessibilityLabel={args.isVerifying ? args.copy.submitting : args.copy.verifySubmit}
      >
        <Text
          className={clsx("text-sm font-semibold text-primary-foreground", c.submitButtonText)}
          style={s.submitButtonText}
        >
          {args.isVerifying ? args.copy.submitting : args.copy.verifySubmit}
        </Text>
      </Pressable>
      <TwoFactorError classNames={c} error={args.error} styles={s} />
    </View>
  );
}

function TwoFactorBackupStep(args: {
  backupCodes: string[];
  classNames: ExpoEnableTwoFactorFormClassNames;
  copy: TwoFactorFormCopy;
  onDone?: () => void;
  styles: ExpoEnableTwoFactorFormStyles;
}) {
  const s = args.styles;
  const c = args.classNames;
  return (
    <View className="w-full">
      <View className={clsx("w-full py-2 gap-1", c.backupCodes)} style={s.backupCodes}>
        {args.backupCodes.map((backupCode) => (
          <Text
            key={backupCode}
            selectable
            className={clsx("text-base font-mono text-foreground", c.backupCode)}
            style={s.backupCode}
          >
            {backupCode}
          </Text>
        ))}
      </View>
      <Pressable
        onPress={() => args.onDone?.()}
        className={clsx(
          "w-full border border-border bg-card rounded-md p-3 mt-4 items-center",
          c.submitButton,
        )}
        style={s.submitButton}
        accessibilityRole="button"
        accessibilityLabel={args.copy.done}
      >
        <Text
          className={clsx("text-sm font-medium text-card-foreground", c.submitButtonText)}
          style={s.submitButtonText}
        >
          {args.copy.done}
        </Text>
      </Pressable>
    </View>
  );
}

function TwoFactorError(args: {
  classNames: ExpoEnableTwoFactorFormClassNames;
  error: string | null;
  styles: ExpoEnableTwoFactorFormStyles;
}) {
  const s = args.styles;
  const c = args.classNames;
  return args.error === null ? null : (
    <Text className={clsx("text-sm text-destructive mt-2", c.errorState)} style={s.errorState}>
      {args.error}
    </Text>
  );
}
