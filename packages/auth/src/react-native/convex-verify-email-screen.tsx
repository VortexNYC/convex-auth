/**
 * ConvexVerifyEmailScreen (RN) — drop-in landing screen for
 * verification email deep-links. Mirrors the web component.
 *
 * Consumer usage:
 *   const { token } = useLocalSearchParams<{ token?: string }>();
 *   <ConvexVerifyEmailScreen
 *     authClient={convexAuth.authClient}
 *     token={token ?? ''}
 *     userEmail={user?.primaryEmailAddress?.emailAddress ?? null}
 *     resendCallbackUrl="pile://verify-email"
 *     onVerified={() => router.replace('/')}
 *   />
 */
import { useEffect, useState } from "react";
import {
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import {
  useConvexAuthResendVerification,
  useConvexAuthVerifyEmail,
  useConvexAuthClientContext,
  type ConvexBetterAuthClient,
} from "../react/client";

export type ExpoVerifyEmailScreenStyles = {
  root?: StyleProp<ViewStyle>;
  header?: StyleProp<ViewStyle>;
  title?: StyleProp<TextStyle>;
  description?: StyleProp<TextStyle>;
  verifyingState?: StyleProp<TextStyle>;
  verifiedState?: StyleProp<TextStyle>;
  errorState?: StyleProp<TextStyle>;
  missingTokenState?: StyleProp<TextStyle>;
  resendButton?: StyleProp<ViewStyle>;
  resendButtonText?: StyleProp<TextStyle>;
};

export type ExpoVerifyEmailScreenCopy = {
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

export type ExpoVerifyEmailScreenProps = {
  authClient?: ConvexBetterAuthClient | null;
  token: string;
  userEmail?: string | null;
  resendCallbackUrl?: string;
  styles?: ExpoVerifyEmailScreenStyles;
  copy?: ExpoVerifyEmailScreenCopy;
  onVerified?: () => void;
};

const DEFAULT_COPY: Required<ExpoVerifyEmailScreenCopy> = {
  title: "Verify your email",
  description: "Hang tight while we confirm your email address.",
  verifying: "Verifying your email…",
  verified: "Email verified. You can close this screen.",
  errorPrefix: "We couldn't verify this link:",
  missingTokenMessage:
    "This verification link is missing or invalid. Request a new verification email.",
  resend: "Resend verification email",
  resending: "Sending…",
  resendSuccess: "Verification email sent. Check your inbox.",
  unavailable: "Email verification is not available on this auth client.",
};

export function ConvexVerifyEmailScreen(props: ExpoVerifyEmailScreenProps) {
  const contextClient = useConvexAuthClientContext();
  const authClient = props.authClient ?? contextClient ?? null;
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const s = props.styles ?? {};
  const { status, error, verifyEmail } = useConvexAuthVerifyEmail(authClient);
  const { resend, isResending } = useConvexAuthResendVerification(authClient);
  const [resendResult, setResendResult] = useState<string | null>(null);

  const hasToken = props.token.length > 0;
  const canResend =
    props.userEmail !== null && props.userEmail !== undefined && props.userEmail.length > 0;

  useEffect(() => {
    if (!hasToken) return undefined;
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
  }, [props.token, authClient, hasToken]);

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
    <View className="w-full py-2" style={s.root}>
      <View className="px-4 pb-3" style={s.header}>
        <Text className="text-base font-semibold text-foreground" style={s.title}>
          {copy.title}
        </Text>
        <Text className="text-sm text-muted-foreground mt-0.5" style={s.description}>
          {copy.description}
        </Text>
      </View>
      {!hasToken ? (
        <Text className="text-destructive px-4 pt-2 text-sm" style={s.missingTokenState}>
          {copy.missingTokenMessage}
        </Text>
      ) : status === "verifying" || status === "idle" ? (
        <Text className="px-4 pt-2 text-sm text-foreground" style={s.verifyingState}>
          {copy.verifying}
        </Text>
      ) : status === "verified" ? (
        <Text className="px-4 pt-2 text-sm text-success" style={s.verifiedState}>
          {copy.verified}
        </Text>
      ) : (
        <View>
          <Text className="text-destructive px-4 pt-2 text-sm" style={s.errorState}>
            {copy.errorPrefix} {error}
          </Text>
          {canResend ? (
            <Pressable
              onPress={() => void handleResend()}
              disabled={isResending}
              className="mx-4 mt-3 px-3 py-2.5 rounded-md border border-input bg-background items-center justify-center"
              style={s.resendButton}
              accessibilityRole="button"
              accessibilityLabel={copy.resend}
            >
              <Text className="text-sm font-medium text-foreground" style={s.resendButtonText}>
                {isResending ? copy.resending : copy.resend}
              </Text>
            </Pressable>
          ) : null}
          {resendResult !== null ? (
            <Text className="px-4 pt-2 text-sm text-success" style={s.verifiedState}>
              {resendResult}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}
