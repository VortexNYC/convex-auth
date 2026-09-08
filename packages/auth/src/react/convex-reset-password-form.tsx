/**
 * ConvexResetPasswordForm — drop-in "set a new password" form that
 * completes the recovery loop started by ConvexForgotPasswordForm.
 *
 * Consumer usage (on the page Better-Auth's email link points at):
 *   const token = new URLSearchParams(location.search).get('token') ?? '';
 *   <ConvexResetPasswordForm
 *     authClient={authClient}
 *     token={token}
 *     onReset={() => router.push('/sign-in')}
 *   />
 *
 * The token is required — the form refuses to render the inputs and
 * shows a "missing or invalid token" message if it's empty.
 */
import { useState, type ChangeEvent, type FormEvent } from "react";

import { useConvexAuthResetPassword } from "./auth-client-hooks";
import type { ConvexBetterAuthClient } from "./auth-client-types";
import { useConvexAuthClientContext } from "./convex-auth-client-provider";
import { AuthCard, AuthCardContent, AuthCardHeader, AuthField, AuthInput, AuthLabel } from "./ui";

export type ConvexResetPasswordFormClassNames = {
  root?: string;
  form?: string;
  field?: string;
  label?: string;
  input?: string;
  submitButton?: string;
  successState?: string;
  errorState?: string;
};

export type ConvexResetPasswordFormCopy = {
  title?: string;
  description?: string;
  passwordLabel?: string;
  confirmPasswordLabel?: string;
  submit?: string;
  submitting?: string;
  successMessage?: string;
  unavailable?: string;
  missingTokenMessage?: string;
  mismatchMessage?: string;
  minLengthMessage?: string;
};

export type ConvexResetPasswordFormProps = {
  authClient?: ConvexBetterAuthClient | null;
  /** Reset token from the recovery email (typically `?token=…`). */
  token: string;
  /**
   * Minimum new-password length to enforce client-side. Defaults to
   * 12 (matches the package's server-side `minPasswordLength` default).
   * The server is authoritative either way.
   */
  minPasswordLength?: number;
  classNames?: ConvexResetPasswordFormClassNames;
  copy?: ConvexResetPasswordFormCopy;
  onReset?: () => void;
};

const DEFAULT_COPY: Required<ConvexResetPasswordFormCopy> = {
  title: "Set a new password",
  description: "Pick something you'll remember this time.",
  passwordLabel: "New password",
  confirmPasswordLabel: "Confirm new password",
  submit: "Set new password",
  submitting: "Saving…",
  successMessage: "Password updated. You can now sign in with your new password.",
  unavailable: "Password reset is not available on this auth client.",
  missingTokenMessage:
    "This reset link is missing or invalid. Request a new password reset email and try again.",
  mismatchMessage: "Passwords don't match.",
  minLengthMessage: "Password is too short.",
};

export function ConvexResetPasswordForm(props: ConvexResetPasswordFormProps) {
  const contextClient = useConvexAuthClientContext();
  const authClient = props.authClient ?? contextClient;
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const cn = props.classNames ?? {};
  const minLength = props.minPasswordLength ?? 12;

  const { resetPassword, isResetting } = useConvexAuthResetPassword(authClient);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAvailable = authClient?.resetPassword !== undefined;
  const hasToken = props.token.length > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(null);
    setError(null);
    if (password.length < minLength) {
      setError(`${copy.minLengthMessage} (minimum ${minLength} characters)`);
      return;
    }
    if (password !== confirm) {
      setError(copy.mismatchMessage);
      return;
    }
    const result = await resetPassword({
      newPassword: password,
      token: props.token,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(copy.successMessage);
    props.onReset?.();
  }

  return (
    <AuthCard className={cn.root}>
      <AuthCardHeader title={copy.title} description={copy.description} />
      <AuthCardContent>
        {!isAvailable ? (
          <div className={cn.errorState}>{copy.unavailable}</div>
        ) : !hasToken ? (
          <div className={cn.errorState} role="alert">
            {copy.missingTokenMessage}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={cn.form}>
            <AuthField className={cn.field}>
              <AuthLabel htmlFor="convex-reset-password" className={cn.label}>
                {copy.passwordLabel}
              </AuthLabel>
              <AuthInput
                id="convex-reset-password"
                type="password"
                value={password}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                className={cn.input}
                minLength={minLength}
                required
              />
            </AuthField>
            <AuthField className={cn.field}>
              <AuthLabel htmlFor="convex-reset-password-confirm" className={cn.label}>
                {copy.confirmPasswordLabel}
              </AuthLabel>
              <AuthInput
                id="convex-reset-password-confirm"
                type="password"
                value={confirm}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirm(e.target.value)}
                className={cn.input}
                minLength={minLength}
                required
              />
            </AuthField>
            <button type="submit" disabled={isResetting} className={cn.submitButton}>
              {isResetting ? copy.submitting : copy.submit}
            </button>
            {success !== null ? (
              <div className={cn.successState} role="status">
                {success}
              </div>
            ) : null}
            {error !== null ? (
              <div className={cn.errorState} role="alert">
                {error}
              </div>
            ) : null}
          </form>
        )}
      </AuthCardContent>
    </AuthCard>
  );
}
