/**
 * ConvexVerifyTwoFactorForm — drop-in 2FA step-up for sign-in.
 *
 * When `signIn.email` returns `data.twoFactorRedirect === true`, the
 * user is mid-sign-in and must satisfy the second factor. Render this:
 * it collects a TOTP code (default) and lets the user switch to a
 * one-time backup code. On success it calls `onVerified` — the session
 * is now fully authenticated.
 *
 * Consumer usage:
 *   const res = await authClient.signIn.email({ email, password });
 *   if (res.data?.twoFactorRedirect) setNeeds2fa(true);
 *   ...
 *   <ConvexVerifyTwoFactorForm
 *     authClient={authClient}
 *     onVerified={() => window.location.assign('/app')}
 *   />
 */
import { useState, type ChangeEvent, type FormEvent } from "react";

import { useConvexAuthVerifyBackupCode, useConvexAuthVerifyTotp } from "./auth-client-hooks";
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

export type ConvexVerifyTwoFactorFormClassNames = {
  root?: string;
  form?: string;
  field?: string;
  label?: string;
  input?: string;
  submitButton?: string;
  toggleButton?: string;
  trustToggle?: string;
  errorState?: string;
};

export type ConvexVerifyTwoFactorFormCopy = {
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

export type ConvexVerifyTwoFactorFormProps = {
  authClient?: ConvexBetterAuthClient | null;
  /**
   * Show the "trust this device" checkbox (skips 2FA on this device for
   * the server's trust window). Defaults to true.
   */
  showTrustDevice?: boolean;
  classNames?: ConvexVerifyTwoFactorFormClassNames;
  copy?: ConvexVerifyTwoFactorFormCopy;
  /** Fired once the second factor is satisfied and the session is live. */
  onVerified?: () => void;
};

const DEFAULT_COPY: Required<ConvexVerifyTwoFactorFormCopy> = {
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

export function ConvexVerifyTwoFactorForm(props: ConvexVerifyTwoFactorFormProps) {
  const contextClient = useConvexAuthClientContext();
  const authClient = props.authClient ?? contextClient;
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const cn = props.classNames ?? {};
  const showTrustDevice = props.showTrustDevice ?? true;

  const { verifyTotp, isVerifying: isVerifyingTotp } = useConvexAuthVerifyTotp(authClient);
  const { verifyBackupCode, isVerifying: isVerifyingBackup } =
    useConvexAuthVerifyBackupCode(authClient);

  const [mode, setMode] = useState<Mode>("totp");
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAvailable = authClient?.twoFactor?.verifyTotp !== undefined;
  const isVerifying = isVerifyingTotp || isVerifyingBackup;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      <AuthCard className={cn.root}>
        <AuthCardHeader title={copy.title} description={copy.description} />
        <AuthCardContent>
          <div className={cn.errorState} role="alert">
            {copy.unavailable}
          </div>
        </AuthCardContent>
      </AuthCard>
    );
  }

  return (
    <AuthCard className={cn.root}>
      <AuthCardHeader title={copy.title} description={copy.description} />
      <AuthCardContent>
        <form onSubmit={handleSubmit} className={cn.form}>
          <AuthField className={cn.field}>
            <AuthLabel htmlFor="convex-2fa-verify-code" className={cn.label}>
              {mode === "totp" ? copy.codeLabel : copy.backupCodeLabel}
            </AuthLabel>
            <AuthInput
              id="convex-2fa-verify-code"
              inputMode={mode === "totp" ? "numeric" : "text"}
              autoComplete="one-time-code"
              value={code}
              placeholder={mode === "totp" ? copy.codePlaceholder : copy.backupCodePlaceholder}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setCode(e.target.value)}
              className={cn.input}
              required
            />
          </AuthField>

          {showTrustDevice ? (
            <label className={cn.trustToggle}>
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setTrustDevice(e.target.checked)}
              />{" "}
              {copy.trustDeviceLabel}
            </label>
          ) : null}

          <AuthButton type="submit" disabled={isVerifying} className={cn.submitButton}>
            {isVerifying ? copy.submitting : copy.submit}
          </AuthButton>

          <AuthButton
            type="button"
            variant="ghost"
            onClick={() => switchMode(mode === "totp" ? "backup" : "totp")}
            className={cn.toggleButton}
          >
            {mode === "totp" ? copy.useBackupCode : copy.useAuthenticator}
          </AuthButton>

          {error !== null ? (
            <div className={cn.errorState} role="alert">
              {error}
            </div>
          ) : null}
        </form>
      </AuthCardContent>
    </AuthCard>
  );
}
