import { useEffect, useState } from "react";
import {
  AuthSignInForm,
  AuthSignUpForm,
  ConvexAuthSurface,
  ConvexForgotPasswordForm,
  ConvexResetPasswordForm,
  ConvexVerifyTwoFactorForm,
  useConvexAuthClient,
} from "@vortex-api/convex-auth/react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@vortex-api/convex-auth/ui";

type ViewMode =
  | "signIn"
  | "signUp"
  | "forgot"
  | "reset"
  | "verifyTwoFactor"
  | "magicLink"
  | "emailOtp";

const providers = [
  { id: "google", label: "Google" },
  { id: "github", label: "GitHub" },
  { id: "discord", label: "Discord" },
] as const;

export function SignInView() {
  const authClient = useConvexAuthClient();
  const [mode, setMode] = useState<ViewMode>("signIn");
  const [status, setStatus] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState("");
  const [magicEmail, setMagicEmail] = useState("");
  const [magicLinkUrl, setMagicLinkUrl] = useState<string | null>(null);
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reset = params.get("reset");
    const token = params.get("token");
    if (reset !== null && token) {
      setResetToken(token);
      setMode("reset");
    }
  }, []);

  const isResendEmailId = (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const startOAuth = async (provider: string) => {
    const result = await authClient.signIn.social({
      provider,
      callbackURL: window.location.origin,
    });
    if (result.error) {
      setStatus(result.error.message ?? "OAuth sign-in failed");
      return;
    }
    if (result.data?.url) {
      window.location.href = result.data.url;
    }
  };

  const handleSignIn = async (values: { email: string; password: string }) => {
    setIsSubmitting(true);
    setStatus(null);
    try {
      const result = await authClient.signIn.email(values);
      if (result.error) {
        setStatus(result.error.message ?? "Sign in failed");
        return;
      }
      if (result.data?.twoFactorRedirect) {
        setMode("verifyTwoFactor");
        return;
      }
      setStatus("Signed in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUp = async (values: { name: string; email: string; password: string }) => {
    setIsSubmitting(true);
    setStatus(null);
    try {
      const result = await authClient.signUp.email(values);
      if (result.error) {
        setStatus(result.error.message ?? "Sign up failed");
        return;
      }
      setStatus("Account created.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerified = () => {
    setStatus("Two-factor verified.");
    setMode("signIn");
  };

  const handleSendMagicLink = async () => {
    setIsSubmitting(true);
    setStatus(null);
    setMagicLinkUrl(null);
    try {
      const result = await authClient.signInWithMagicLink({
        email: magicEmail,
        callbackURL: window.location.origin,
      });
      if (result.error) {
        setStatus(result.error.message ?? "Could not send magic link");
        return;
      }
      if (result.data?.status === "queued" && result.data.emailId) {
        const id = result.data.emailId;
        if (isResendEmailId(id)) {
          setMagicLinkUrl(null);
          setStatus(`Magic link sent to ${magicEmail}. Check your inbox. (Resend: ${id})`);
        } else {
          const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL ?? window.location.origin;
          const url = `${siteUrl}/api/auth/magic-link/verify?token=${encodeURIComponent(id)}&callbackURL=${encodeURIComponent(window.location.origin)}`;
          setMagicLinkUrl(url);
          setStatus("Magic link queued. Click the link to sign in.");
        }
      } else {
        setStatus(result.data?.reason ?? "Magic link not sent");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send magic link");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendOtp = async () => {
    setIsSubmitting(true);
    setStatus(null);
    setOtpSent(false);
    try {
      const result = await authClient.signInWithEmailOtp?.({ email: otpEmail, type: "sign-in" });
      if (result?.error) {
        setStatus(result.error.message ?? "Could not send email OTP");
        return;
      }
      if (result?.data?.status === "queued" && result.data.emailId) {
        const id = result.data.emailId;
        setOtpSent(true);
        setOtpCode("");
        setStatus(
          isResendEmailId(id)
            ? `Email OTP sent to ${otpEmail}. Check your inbox for the code. (Resend: ${id})`
            : `Email OTP queued: ${id}`,
        );
      } else {
        setStatus(result?.data?.reason ?? "Email OTP not sent");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send email OTP");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!authClient.verifyEmailOtp) return;
    setIsSubmitting(true);
    setStatus(null);
    try {
      const result = await authClient.verifyEmailOtp({
        email: otpEmail,
        otp: otpCode,
        type: "sign-in",
      });
      if (result.error) {
        setStatus(result.error.message ?? "Could not verify email OTP");
        return;
      }
      if (result.data && typeof result.data === "object" && "token" in result.data) {
        setStatus("Signed in with email OTP.");
      } else {
        setStatus("Email OTP verification failed.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not verify email OTP");
    } finally {
      setIsSubmitting(false);
    }
  };

  const footerLink = (label: string, next: ViewMode) => (
    <button
      type="button"
      onClick={() => {
        setStatus(null);
        setMode(next);
      }}
      className="text-foreground/70 hover:text-foreground text-sm underline underline-offset-4"
    >
      {label}
    </button>
  );

  return (
    <ConvexAuthSurface
      title="convex-auth OAuth example"
      description="Sign in to see the user state, profile, sessions, and token refresh."
      eyebrow="Auth demo"
      sidebarTitle="Convex-native authentication"
      sidebarBody="OAuth, email and password, 2FA, organizations, sessions, and verification flows in one example."
      features={[
        { title: "OAuth providers", body: "Google, GitHub, and Discord sign-in." },
        { title: "Email & password", body: "Sign up, sign in, reset, and verify." },
        { title: "Two-factor", body: "TOTP setup, backup codes, and challenge flow." },
      ]}
    >
      <div className="w-full max-w-md space-y-4">
        {mode === "verifyTwoFactor" ? (
          <>
            <ConvexVerifyTwoFactorForm onVerified={handleVerified} />
            <div className="text-center">{footerLink("Back to sign in", "signIn")}</div>
          </>
        ) : mode === "forgot" ? (
          <>
            <ConvexForgotPasswordForm
              resetPasswordUrl={`${window.location.origin}/?reset`}
              onRequested={() => setStatus("If an account exists, a reset email was queued.")}
            />
            <div className="text-center">{footerLink("Back to sign in", "signIn")}</div>
          </>
        ) : mode === "reset" ? (
          <>
            <ConvexResetPasswordForm
              token={resetToken}
              onReset={() => {
                setMode("signIn");
                window.history.replaceState(null, "", window.location.pathname);
              }}
            />
            <div className="text-center">{footerLink("Back to sign in", "signIn")}</div>
          </>
        ) : mode === "signUp" ? (
          <>
            <AuthSignUpForm
              title="Create account"
              description="Choose a provider or use your email and password."
              providers={providers}
              onProviderSelect={startOAuth}
              onSubmit={handleSignUp}
              isSubmitting={isSubmitting}
              error={status ?? undefined}
              footer={
                <div className="text-center">
                  {footerLink("Already have an account? Sign in", "signIn")}
                </div>
              }
            />
          </>
        ) : mode === "emailOtp" ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Email OTP sign-in</CardTitle>
                <CardDescription>
                  Enter your email, get the queued code, then enter it.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="otp-email">Email</Label>
                  <Input
                    id="otp-email"
                    type="email"
                    value={otpEmail}
                    onChange={(e) => setOtpEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={isSubmitting || otpSent}
                  />
                </div>
                {otpSent ? (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="otp-code">One-time code</Label>
                      <Input
                        id="otp-code"
                        type="text"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="123456"
                        disabled={isSubmitting}
                      />
                    </div>
                    <Button
                      onClick={() => void handleVerifyOtp()}
                      disabled={isSubmitting || !otpCode.trim()}
                    >
                      {isSubmitting ? "Verifying…" : "Verify OTP"}
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={() => void handleSendOtp()}
                    disabled={isSubmitting || !otpEmail.trim()}
                  >
                    {isSubmitting ? "Sending…" : "Send email OTP"}
                  </Button>
                )}
                {status ? <p className="text-muted-foreground text-sm">{status}</p> : null}
              </CardContent>
            </Card>
            <div className="text-center">{footerLink("Back to sign in", "signIn")}</div>
          </>
        ) : mode === "magicLink" ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Magic link sign-in</CardTitle>
                <CardDescription>Enter your email and click the link we queue.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="magic-email">Email</Label>
                  <Input
                    id="magic-email"
                    type="email"
                    value={magicEmail}
                    onChange={(e) => setMagicEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={isSubmitting}
                  />
                </div>
                <Button
                  onClick={() => void handleSendMagicLink()}
                  disabled={isSubmitting || !magicEmail.trim()}
                >
                  {isSubmitting ? "Sending…" : "Send magic link"}
                </Button>
                {magicLinkUrl ? (
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-sm">
                      Click the link to finish signing in:
                    </p>
                    <a
                      href={magicLinkUrl}
                      className="text-foreground break-all font-mono text-xs underline"
                    >
                      {magicLinkUrl}
                    </a>
                  </div>
                ) : null}
                {status ? <p className="text-muted-foreground text-sm">{status}</p> : null}
              </CardContent>
            </Card>
            <div className="text-center">{footerLink("Back to sign in", "signIn")}</div>
          </>
        ) : (
          <>
            <AuthSignInForm
              title="Sign in"
              description="Choose a provider or use your email and password."
              providers={providers}
              onProviderSelect={startOAuth}
              onSubmit={handleSignIn}
              isSubmitting={isSubmitting}
              error={status ?? undefined}
              footer={
                <div className="flex flex-col gap-2 text-center">
                  {footerLink("Forgot password?", "forgot")}
                  {footerLink("Sign in with email OTP", "emailOtp")}
                  {footerLink("Sign in with magic link", "magicLink")}
                  {footerLink("Create account", "signUp")}
                </div>
              }
            />
          </>
        )}
      </div>
    </ConvexAuthSurface>
  );
}
