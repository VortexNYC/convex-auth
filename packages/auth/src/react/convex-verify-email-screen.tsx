/**
 * ConvexVerifyEmailScreen — drop-in landing page for verification
 * email links. The user lands here from the email's verify-link
 * (token in `?token=…`); the component auto-runs verification on
 * mount, shows a status, and offers a resend button if it fails
 * AND the consumer is signed in (so we know which email to resend).
 *
 * Consumer usage:
 *   const token = new URLSearchParams(location.search).get('token') ?? '';
 *   <ConvexVerifyEmailScreen
 *     authClient={authClient}
 *     token={token}
 *     userEmail={user?.primaryEmailAddress?.emailAddress ?? null}
 *     resendCallbackUrl={`${origin}/verify-email`}
 *     onVerified={() => router.push('/dashboard')}
 *   />
 *
 * Why this exists: Better-Auth sends the verification email but
 * supplies no UI for the landing page. Without this, consumers
 * either skip email verification or hand-roll a fiddly state
 * machine. Same pattern as ConvexResetPasswordForm.
 */
import { useEffect, useState } from "react";

import { useConvexAuthResendVerification, useConvexAuthVerifyEmail } from "./auth-client-hooks";
import type { ConvexBetterAuthClient } from "./auth-client-types";
import { useConvexAuthClientContext } from "./convex-auth-client-provider";
import { AuthCard, AuthCardContent, AuthCardHeader } from "./ui";

export type ConvexVerifyEmailScreenClassNames = {
  root?: string;
  verifyingState?: string;
  verifiedState?: string;
  errorState?: string;
  missingTokenState?: string;
  resendButton?: string;
};

export type ConvexVerifyEmailScreenCopy = {
  title?: string;
  description?: string;
  verifying?: string;
  verified?: string;
  errorPrefix?: string;
  missingTokenMessage?: string;
  resend?: string;
  resending?: string;
  resendSuccess?: string;
  unavailable?: string;
};

export type ConvexVerifyEmailScreenProps = {
  authClient?: ConvexBetterAuthClient | null;
  /** Token from the verification email's `?token=…` param. */
  token: string;
  /**
   * The current user's email, if signed in. Required to enable the
   * resend-verification button. If absent, the resend button is
   * hidden (no way to know which email to resend to).
   */
  userEmail?: string | null;
  /**
   * Absolute URL of this verify-email page on this app. Better-Auth
   * appends a fresh `?token=…` to it for the resent email.
   */
  resendCallbackUrl?: string;
  classNames?: ConvexVerifyEmailScreenClassNames;
  copy?: ConvexVerifyEmailScreenCopy;
  /** Called on successful verification (after the verify call returns ok). */
  onVerified?: () => void;
};

const DEFAULT_COPY: Required<ConvexVerifyEmailScreenCopy> = {
  title: "Verify your email",
  description: "Hang tight while we confirm your email address.",
  verifying: "Verifying your email…",
  verified: "Email verified. You can close this page.",
  errorPrefix: "We couldn't verify this link:",
  missingTokenMessage:
    "This verification link is missing or invalid. Request a new verification email.",
  resend: "Resend verification email",
  resending: "Sending…",
  resendSuccess: "Verification email sent. Check your inbox.",
  unavailable: "Email verification is not available on this auth client.",
};

export function ConvexVerifyEmailScreen(props: ConvexVerifyEmailScreenProps) {
  const contextClient = useConvexAuthClientContext();
  const authClient = props.authClient ?? contextClient;
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const cn = props.classNames ?? {};

  const { status, error, verifyEmail } = useConvexAuthVerifyEmail(authClient);
  const { resend, isResending } = useConvexAuthResendVerification(authClient);
  const [resendResult, setResendResult] = useState<string | null>(null);

  const hasToken = props.token.length > 0;
  const isAvailable = authClient?.verifyEmail !== undefined;
  const canResend =
    props.userEmail !== null && props.userEmail !== undefined && props.userEmail.length > 0;

  useEffect(() => {
    if (!isAvailable || !hasToken) return undefined;
    let cancelled = false;
    void (async () => {
      const result = await verifyEmail({ token: props.token });
      if (!cancelled && result.ok) {
        props.onVerified?.();
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-run only if the token or client changes — onVerified should
    // not retrigger this effect even if the parent re-creates it.
  }, [props.token, authClient, props.onVerified, isAvailable, hasToken]);

  async function handleResend() {
    setResendResult(null);
    if (props.userEmail === null || props.userEmail === undefined || props.userEmail.length === 0) {
      return;
    }
    const result = await resend({
      email: props.userEmail,
      callbackURL: props.resendCallbackUrl,
    });
    if (!result.ok) {
      setResendResult(result.error);
      return;
    }
    setResendResult(copy.resendSuccess);
  }

  return (
    <AuthCard className={cn.root}>
      <AuthCardHeader title={copy.title} description={copy.description} />
      <AuthCardContent>
        {!isAvailable ? (
          <div className={cn.errorState}>{copy.unavailable}</div>
        ) : !hasToken ? (
          <div className={cn.missingTokenState} role="alert">
            {copy.missingTokenMessage}
          </div>
        ) : status === "verifying" || status === "idle" ? (
          <div className={cn.verifyingState} role="status">
            {copy.verifying}
          </div>
        ) : status === "verified" ? (
          <div className={cn.verifiedState} role="status">
            {copy.verified}
          </div>
        ) : (
          <div>
            <div className={cn.errorState} role="alert">
              {copy.errorPrefix} {error}
            </div>
            {canResend ? (
              <button
                type="button"
                onClick={() => void handleResend()}
                disabled={isResending}
                className={cn.resendButton}
              >
                {isResending ? copy.resending : copy.resend}
              </button>
            ) : null}
            {resendResult !== null ? (
              <div className={cn.verifiedState} role="status">
                {resendResult}
              </div>
            ) : null}
          </div>
        )}
      </AuthCardContent>
    </AuthCard>
  );
}
