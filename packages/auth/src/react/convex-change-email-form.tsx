/**
 * ConvexChangeEmailForm — drop-in "change your email" form for
 * consumers. Sends a verification email to the NEW address; once
 * the user clicks the link (which goes through the same
 * verifyEmail flow), the email is updated.
 *
 * Consumer usage:
 *   <ConvexChangeEmailForm
 *     authClient={authClient}
 *     currentEmail={user?.primaryEmailAddress?.emailAddress ?? null}
 *     verifyCallbackUrl={`${origin}/verify-email`}
 *   />
 *
 * Verification email lands on /verify-email — this means
 * ConvexVerifyEmailScreen already covers the second half of the
 * flow. Consumers wire one route; both 'verify after signup' and
 * 'verify after email change' use it.
 */
import { useState, type ChangeEvent, type FormEvent } from "react";

import { useConvexAuthChangeEmail } from "./auth-client-hooks";
import type { ConvexBetterAuthClient } from "./auth-client-types";
import { useConvexAuthClientContext } from "./convex-auth-client-provider";
import { AuthCard, AuthCardContent, AuthCardHeader, AuthField, AuthInput, AuthLabel } from "./ui";

export type ConvexChangeEmailFormClassNames = {
  root?: string;
  form?: string;
  field?: string;
  label?: string;
  input?: string;
  submitButton?: string;
  successState?: string;
  errorState?: string;
};

export type ConvexChangeEmailFormCopy = {
  title?: string;
  description?: string;
  currentEmailLabel?: string;
  newEmailLabel?: string;
  newEmailPlaceholder?: string;
  submit?: string;
  submitting?: string;
  successMessage?: string;
  unavailable?: string;
  sameAsCurrentMessage?: string;
};

export type ConvexChangeEmailFormProps = {
  authClient?: ConvexBetterAuthClient | null;
  /** The user's current email, displayed read-only above the new-email field. */
  currentEmail?: string | null;
  /**
   * Absolute URL of the verify-email page on this app. Better-Auth
   * appends `?token=…` to it for the change-confirmation email.
   */
  verifyCallbackUrl?: string;
  classNames?: ConvexChangeEmailFormClassNames;
  copy?: ConvexChangeEmailFormCopy;
  onRequested?: (newEmail: string) => void;
};

const DEFAULT_COPY: Required<ConvexChangeEmailFormCopy> = {
  title: "Change email",
  description: "We'll send a confirmation link to the new address.",
  currentEmailLabel: "Current email",
  newEmailLabel: "New email",
  newEmailPlaceholder: "new@example.com",
  submit: "Send confirmation",
  submitting: "Sending…",
  successMessage:
    "Confirmation email sent. Click the link from the new address to finish the change.",
  unavailable: "Email change is not available on this auth client.",
  sameAsCurrentMessage: "New email is the same as your current email.",
};

export function ConvexChangeEmailForm(props: ConvexChangeEmailFormProps) {
  const contextClient = useConvexAuthClientContext();
  const authClient = props.authClient ?? contextClient;
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const cn = props.classNames ?? {};

  const { requestChange, isRequesting } = useConvexAuthChangeEmail(authClient);
  const [newEmail, setNewEmail] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAvailable = authClient?.changeEmail !== undefined;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(null);
    setError(null);
    const trimmed = newEmail.trim();
    if (trimmed.length === 0) return;
    if (
      props.currentEmail !== null &&
      props.currentEmail !== undefined &&
      trimmed.toLowerCase() === props.currentEmail.toLowerCase()
    ) {
      setError(copy.sameAsCurrentMessage);
      return;
    }
    const result = await requestChange({
      newEmail: trimmed,
      callbackURL: props.verifyCallbackUrl,
    });
    if (!result.ok) {
      setError(result.error);
      return;
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
            {props.currentEmail !== null && props.currentEmail !== undefined ? (
              <AuthField className={cn.field}>
                <AuthLabel htmlFor="convex-change-email-current" className={cn.label}>
                  {copy.currentEmailLabel}
                </AuthLabel>
                <AuthInput
                  id="convex-change-email-current"
                  value={props.currentEmail}
                  readOnly
                  className={cn.input}
                />
              </AuthField>
            ) : null}
            <AuthField className={cn.field}>
              <AuthLabel htmlFor="convex-change-email-new" className={cn.label}>
                {copy.newEmailLabel}
              </AuthLabel>
              <AuthInput
                id="convex-change-email-new"
                type="email"
                value={newEmail}
                placeholder={copy.newEmailPlaceholder}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewEmail(e.target.value)}
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
