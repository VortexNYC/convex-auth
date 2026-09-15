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
  useColorScheme,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { clsx } from "clsx";

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

export type ExpoVerifyEmailScreenClassNames = {
  root?: string;
  header?: string;
  title?: string;
  description?: string;
  verifyingState?: string;
  verifiedState?: string;
  errorState?: string;
  missingTokenState?: string;
  resendButton?: string;
  resendButtonText?: string;
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
  classNames?: ExpoVerifyEmailScreenClassNames;
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
  const c = props.classNames ?? {};
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
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

  const rootClassName = clsx(
    "w-full max-w-md self-center p-4 bg-background",
    c.root,
    isDark && "dark",
  );

  return (
    <View className={rootClassName} style={s.root}>
      <View className={clsx("pb-3", c.header)} style={s.header}>
        <Text className={clsx("text-2xl font-bold text-foreground", c.title)} style={s.title}>
          {copy.title}
        </Text>
        <Text
          className={clsx("text-sm text-muted-foreground", c.description)}
          style={s.description}
        >
          {copy.description}
        </Text>
      </View>
      {!hasToken ? (
        <Text
          className={clsx("text-sm text-destructive mt-2", c.missingTokenState)}
          style={s.missingTokenState}
        >
          {copy.missingTokenMessage}
        </Text>
      ) : status === "verifying" || status === "idle" ? (
        <Text
          className={clsx("text-sm text-muted-foreground mt-2", c.verifyingState)}
          style={s.verifyingState}
        >
          {copy.verifying}
        </Text>
      ) : status === "verified" ? (
        <Text
          className={clsx("text-sm text-muted-foreground mt-2", c.verifiedState)}
          style={s.verifiedState}
        >
          {copy.verified}
        </Text>
      ) : (
        <View className="w-full">
          <Text
            className={clsx("text-sm text-destructive mt-2", c.errorState)}
            style={s.errorState}
          >
            {copy.errorPrefix} {error}
          </Text>
          {canResend ? (
            <Pressable
              onPress={() => void handleResend()}
              disabled={isResending}
              className={clsx(
                "w-full border border-border bg-card rounded-md p-3 mt-4 items-center",
                c.resendButton,
              )}
              style={s.resendButton}
              accessibilityRole="button"
              accessibilityLabel={isResending ? copy.resending : copy.resend}
            >
              <Text
                className={clsx("text-sm text-card-foreground", c.resendButtonText)}
                style={s.resendButtonText}
              >
                {isResending ? copy.resending : copy.resend}
              </Text>
            </Pressable>
          ) : null}
          {resendResult !== null ? (
            <Text
              className={clsx("text-sm text-muted-foreground mt-2", c.verifiedState)}
              style={s.verifiedState}
            >
              {resendResult}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}
