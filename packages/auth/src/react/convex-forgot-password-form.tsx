/**
 * ConvexForgotPasswordForm — drop-in "request a password reset email"
 * form for consumers. Mirrors the API of ConvexProfileEditForm.
 *
 * Consumer usage:
 *   <ConvexForgotPasswordForm
 *     authClient={authClient}
 *     resetPasswordUrl={`${window.location.origin}/reset-password`}
 *     copy={{ title: 'Forgot your Pile password?' }}
 *   />
 *
 * The component is purely presentational — the actual API call goes
 * through `useConvexAuthForgotPassword` so consumers can swap the UI
 * without losing the runtime logic.
 *
 * The component always shows a generic success message after submit
 * (whether or not the email is registered) — standard practice to
 * avoid leaking which addresses have accounts.
 */
import { useState, type ChangeEvent, type FormEvent } from "react";

import { useConvexAuthForgotPassword } from "./auth-client-hooks";
import type { ConvexBetterAuthClient } from "./auth-client-types";
import { useConvexAuthClientContext } from "./convex-auth-client-provider";
import { AuthCard, AuthCardContent, AuthCardHeader, AuthField, AuthInput, AuthLabel } from "./ui";

export type ConvexForgotPasswordFormClassNames = {
  root?: string;
  form?: string;
  field?: string;
  label?: string;
  input?: string;
  submitButton?: string;
  successState?: string;
  errorState?: string;
};

export type ConvexForgotPasswordFormCopy = {
  title?: string;
  description?: string;
  emailLabel?: string;
  emailPlaceholder?: string;
  submit?: string;
  submitting?: string;
  successMessage?: string;
  unavailable?: string;
};

export type ConvexForgotPasswordFormProps = {
  authClient?: ConvexBetterAuthClient | null;
  /**
   * Absolute URL of the reset-password page on this app. Better-Auth
   * appends `?token=…` to it before sending the email.
   */
  resetPasswordUrl: string;
  classNames?: ConvexForgotPasswordFormClassNames;
  copy?: ConvexForgotPasswordFormCopy;
  onRequested?: (email: string) => void;
};

const DEFAULT_COPY: Required<ConvexForgotPasswordFormCopy> = {
  title: "Forgot your password?",
  description: "Enter your email and we'll send you a reset link.",
  emailLabel: "Email",
  emailPlaceholder: "you@example.com",
  submit: "Send reset link",
  submitting: "Sending…",
  successMessage:
    "If an account exists for that email, you'll receive a password reset link shortly.",
  unavailable: "Password recovery is not available on this auth client.",
};

export function ConvexForgotPasswordForm(props: ConvexForgotPasswordFormProps) {
  const contextClient = useConvexAuthClientContext();
  const authClient = props.authClient ?? contextClient;
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const cn = props.classNames ?? {};

  const { requestReset, isRequesting } = useConvexAuthForgotPassword(authClient);
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAvailable = authClient?.forgetPassword !== undefined;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(null);
    setError(null);
    const trimmed = email.trim();
    if (trimmed.length === 0) return;
    const result = await requestReset({
      email: trimmed,
      redirectTo: props.resetPasswordUrl,
    });
    if (!result.ok) {
      // Even on error, show the generic success message to avoid
      // address enumeration. Only surface a real error if the runtime
      // says recovery is genuinely unavailable.
      if (result.error === "Password recovery is not available on this auth client") {
        setError(result.error);
        return;
      }
    }
    setSuccess(copy.successMessage);
    props.onRequested?.(trimmed);
  }

  return (
    <AuthCard className={cn.root}>
      <AuthCardHeader title={copy.title} description={copy.description} />
      <AuthCardContent>
        {isAvailable ? (
          <form onSubmit={handleSubmit} className={cn.form}>
            <AuthField className={cn.field}>
              <AuthLabel htmlFor="convex-forgot-email" className={cn.label}>
                {copy.emailLabel}
              </AuthLabel>
              <AuthInput
                id="convex-forgot-email"
                type="email"
                value={email}
                placeholder={copy.emailPlaceholder}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                className={cn.input}
                required
              />
            </AuthField>
            <button type="submit" disabled={isRequesting} className={cn.submitButton}>
              {isRequesting ? copy.submitting : copy.submit}
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
        ) : (
          <div className={cn.errorState}>{copy.unavailable}</div>
        )}
      </AuthCardContent>
    </AuthCard>
  );
}
