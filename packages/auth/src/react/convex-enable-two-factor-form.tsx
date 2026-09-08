/**
 * ConvexEnableTwoFactorForm — drop-in TOTP enrollment flow.
 *
 * Three steps, one component:
 *   1. password — re-authenticate, then call `enable` (returns the
 *      otpauth URI + one-time backup codes).
 *   2. verify   — show the secret (and a QR via the optional `renderQR`
 *      slot), collect a 6-digit code, confirm via `verifyTotp`.
 *   3. backup   — show the recovery codes ONCE, then `onEnrolled`.
 *
 * Deliberately ships NO QR dependency: the package stays dependency-free
 * and storage/render-agnostic. Manual-entry of the secret is always a
 * complete enrollment path; pass `renderQR` (e.g. a `qrcode.react`
 * <QRCodeSVG value={uri} />) to add the scan affordance.
 *
 * Consumer usage:
 *   <ConvexEnableTwoFactorForm
 *     authClient={authClient}
 *     issuer="Pile"
 *     renderQR={(uri) => <QRCodeSVG value={uri} size={180} />}
 *     onEnrolled={() => router.push('/settings/security')}
 *   />
 */
import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";

import {
  extractTotpSecret,
  useConvexAuthEnableTwoFactor,
  useConvexAuthVerifyTotp,
} from "./auth-client-hooks";
import type { ConvexBetterAuthClient } from "./auth-client-types";
import { useConvexAuthClientContext } from "./convex-auth-client-provider";
import {
  AuthButton,
  AuthCard,
  AuthCardContent,
  AuthCardHeader,
  AuthField,
  AuthInput,
  AuthLabel,
} from "./ui";

export type ConvexEnableTwoFactorFormClassNames = {
  root?: string;
  form?: string;
  field?: string;
  label?: string;
  input?: string;
  submitButton?: string;
  secret?: string;
  qr?: string;
  backupCodes?: string;
  backupCode?: string;
  successState?: string;
  errorState?: string;
};

export type ConvexEnableTwoFactorFormCopy = {
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

export type ConvexEnableTwoFactorFormProps = {
  authClient?: ConvexBetterAuthClient | null;
  /** Authenticator label shown alongside the account (e.g. "Pile"). */
  issuer?: string;
  /**
   * Optional QR renderer. Receives the `otpauth://` URI. When omitted,
   * only the manually-enterable secret is shown — still a complete
   * enrollment path. Keeps the package free of a QR dependency.
   */
  renderQR?: (totpURI: string) => ReactNode;
  classNames?: ConvexEnableTwoFactorFormClassNames;
  copy?: ConvexEnableTwoFactorFormCopy;
  /** Fired once enrollment is fully confirmed (after the backup step). */
  onEnrolled?: () => void;
};

const DEFAULT_COPY: Required<ConvexEnableTwoFactorFormCopy> = {
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
type TwoFactorFormCopy = Required<ConvexEnableTwoFactorFormCopy>;

export function ConvexEnableTwoFactorForm(props: ConvexEnableTwoFactorFormProps) {
  const contextClient = useConvexAuthClientContext();
  const authClient = props.authClient ?? contextClient;
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const cn = props.classNames ?? {};

  const { enable, isEnabling } = useConvexAuthEnableTwoFactor(authClient);
  const { verifyTotp, isVerifying } = useConvexAuthVerifyTotp(authClient);

  const [step, setStep] = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [totpURI, setTotpURI] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isAvailable = authClient?.twoFactor?.enable !== undefined;
  const secret = totpURI === null ? null : extractTotpSecret(totpURI);
  const header = getTwoFactorHeader(copy, step);

  async function handlePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    return <TwoFactorUnavailable copy={copy} classNames={cn} />;
  }

  return (
    <AuthCard className={cn.root}>
      <AuthCardHeader title={header.title} description={header.description} />
      <AuthCardContent>
        {step === "password" ? (
          <TwoFactorPasswordStep
            classNames={cn}
            copy={copy}
            error={error}
            isEnabling={isEnabling}
            onPasswordChange={setPassword}
            onSubmit={handlePassword}
            password={password}
          />
        ) : null}
        {step === "verify" ? (
          <TwoFactorVerifyStep
            classNames={cn}
            code={code}
            copy={copy}
            error={error}
            isVerifying={isVerifying}
            onCodeChange={setCode}
            onSubmit={handleVerify}
            renderQR={props.renderQR}
            secret={secret}
            totpURI={totpURI}
          />
        ) : null}
        {step === "backup" ? (
          <TwoFactorBackupStep
            backupCodes={backupCodes}
            classNames={cn}
            copy={copy}
            onDone={props.onEnrolled}
          />
        ) : null}
      </AuthCardContent>
    </AuthCard>
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
  classNames: ConvexEnableTwoFactorFormClassNames;
}) {
  return (
    <AuthCard className={args.classNames.root}>
      <AuthCardHeader title={args.copy.title} description={args.copy.description} />
      <AuthCardContent>
        <div className={args.classNames.errorState} role="alert">
          {args.copy.unavailable}
        </div>
      </AuthCardContent>
    </AuthCard>
  );
}

function TwoFactorPasswordStep(args: {
  classNames: ConvexEnableTwoFactorFormClassNames;
  copy: TwoFactorFormCopy;
  error: string | null;
  isEnabling: boolean;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  password: string;
}) {
  const { classNames: cn, copy } = args;
  return (
    <form onSubmit={args.onSubmit} className={cn.form}>
      <AuthField className={cn.field}>
        <AuthLabel htmlFor="convex-2fa-password" className={cn.label}>
          {copy.passwordLabel}
        </AuthLabel>
        <AuthInput
          id="convex-2fa-password"
          type="password"
          autoComplete="current-password"
          value={args.password}
          placeholder={copy.passwordPlaceholder}
          onChange={(e: ChangeEvent<HTMLInputElement>) => args.onPasswordChange(e.target.value)}
          className={cn.input}
          required
        />
      </AuthField>
      <AuthButton type="submit" disabled={args.isEnabling} className={cn.submitButton}>
        {args.isEnabling ? copy.submitting : copy.passwordSubmit}
      </AuthButton>
      <TwoFactorError error={args.error} className={cn.errorState} />
    </form>
  );
}

function TwoFactorVerifyStep(args: {
  classNames: ConvexEnableTwoFactorFormClassNames;
  code: string;
  copy: TwoFactorFormCopy;
  error: string | null;
  isVerifying: boolean;
  onCodeChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  renderQR?: (totpURI: string) => ReactNode;
  secret: string | null;
  totpURI: string | null;
}) {
  const { classNames: cn, copy } = args;
  return (
    <form onSubmit={args.onSubmit} className={cn.form}>
      {args.totpURI !== null && args.renderQR !== undefined ? (
        <div className={cn.qr}>{args.renderQR(args.totpURI)}</div>
      ) : null}
      {args.secret !== null ? (
        <TwoFactorSecret classNames={cn} copy={copy} secret={args.secret} />
      ) : null}
      <AuthField className={cn.field}>
        <AuthLabel htmlFor="convex-2fa-code" className={cn.label}>
          {copy.codeLabel}
        </AuthLabel>
        <AuthInput
          id="convex-2fa-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={args.code}
          placeholder={copy.codePlaceholder}
          onChange={(e: ChangeEvent<HTMLInputElement>) => args.onCodeChange(e.target.value)}
          className={cn.input}
          required
        />
      </AuthField>
      <AuthButton type="submit" disabled={args.isVerifying} className={cn.submitButton}>
        {args.isVerifying ? copy.submitting : copy.verifySubmit}
      </AuthButton>
      <TwoFactorError error={args.error} className={cn.errorState} />
    </form>
  );
}

function TwoFactorSecret(args: {
  classNames: ConvexEnableTwoFactorFormClassNames;
  copy: TwoFactorFormCopy;
  secret: string;
}) {
  return (
    <AuthField className={args.classNames.field}>
      <AuthLabel className={args.classNames.label}>{args.copy.secretLabel}</AuthLabel>
      <code className={args.classNames.secret} style={{ wordBreak: "break-all" }}>
        {args.secret}
      </code>
    </AuthField>
  );
}

function TwoFactorBackupStep(args: {
  backupCodes: string[];
  classNames: ConvexEnableTwoFactorFormClassNames;
  copy: TwoFactorFormCopy;
  onDone?: () => void;
}) {
  const cn = args.classNames;
  return (
    <div className={cn.successState}>
      <ul className={cn.backupCodes}>
        {args.backupCodes.map((backupCode) => (
          <li key={backupCode} className={cn.backupCode}>
            <code style={{ wordBreak: "break-all" }}>{backupCode}</code>
          </li>
        ))}
      </ul>
      <AuthButton type="button" onClick={() => args.onDone?.()} className={cn.submitButton}>
        {args.copy.done}
      </AuthButton>
    </div>
  );
}

function TwoFactorError(args: { error: string | null; className?: string }) {
  return args.error === null ? null : (
    <div className={args.className} role="alert">
      {args.error}
    </div>
  );
}
