import { useState } from "react";
import {
  AuthSignInForm,
  AuthSignUpForm,
  ConvexAuthSurface,
  ConvexForgotPasswordForm,
  ConvexResetPasswordForm,
  ConvexVerifyTwoFactorForm,
  useConvexAuthClient,
  usePasskeys,
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
  Separator,
} from "@vortex-api/convex-auth/ui";

type ViewMode = "signIn" | "signUp" | "forgot" | "reset" | "verifyTwoFactor";

const oidcClientId = import.meta.env.VITE_OAUTH_OIDC_CLIENT_ID;
const providers = [
  { id: "google", label: "Google" },
  { id: "github", label: "GitHub" },
  { id: "discord", label: "Discord" },
  ...(oidcClientId ? [{ id: "oidc", label: "OIDC" }] : []),
];

export function AuthView() {
  const authClient = useConvexAuthClient();
  const [mode, setMode] = useState<ViewMode>("signIn");
  const [status, setStatus] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    } else {
      setStatus("OAuth sign-in failed: no redirect URL");
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
      title="convex-auth example"
      description="Sign in to see the user state, profile, sessions, and token refresh."
      eyebrow="Auth demo"
      sidebarTitle="Convex-native authentication"
      sidebarBody="OAuth, email and password, 2FA, sessions, and verification flows in one example."
      features={[
        { title: "OAuth providers", body: "Google, GitHub, and Discord sign-in." },
        { title: "Email & password", body: "Sign up, sign in, reset, and verify." },
        { title: "Two-factor", body: "TOTP setup, backup codes, and challenge flow." },
      ]}
    >
      <div className="w-full max-w-md space-y-4">
        {mode === "verifyTwoFactor" ? (
          <>
            <ConvexVerifyTwoFactorForm authClient={authClient} onVerified={handleVerified} />
            <div className="text-center">{footerLink("Back to sign in", "signIn")}</div>
          </>
        ) : mode === "forgot" ? (
          <>
            <ConvexForgotPasswordForm
              resetPasswordUrl={`${window.location.origin}/?reset`}
              onRequested={() => setStatus("If an account exists, a reset email was queued.")}
            />
            <DevResetTokenCard
              onToken={(token) => {
                setResetToken(token);
                setMode("reset");
              }}
            />
            <div className="text-center">{footerLink("Back to sign in", "signIn")}</div>
          </>
        ) : mode === "reset" ? (
          <>
            <ConvexResetPasswordForm token={resetToken} onReset={() => setMode("signIn")} />
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
                  {footerLink("Create account", "signUp")}
                </div>
              }
            />
            <AnonymousSignIn setStatus={setStatus} setIsSubmitting={setIsSubmitting} />
            <PasskeySignIn />
          </>
        )}
      </div>
    </ConvexAuthSurface>
  );
}

function AnonymousSignIn({
  setStatus,
  setIsSubmitting,
}: {
  setStatus: (value: string | null) => void;
  setIsSubmitting: (value: boolean) => void;
}) {
  const authClient = useConvexAuthClient();

  const handleClick = async () => {
    setIsSubmitting(true);
    setStatus(null);
    try {
      const result = await authClient.signIn.anonymous();
      if (result.error) {
        setStatus(result.error.message ?? "Guest sign-in failed");
        return;
      }
      setStatus("Signed in as guest.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Guest</CardTitle>
        <CardDescription>Try the demo without creating an account.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={() => void handleClick()} className="w-full">
          Continue as guest
        </Button>
      </CardContent>
    </Card>
  );
}

function PasskeySignIn() {
  const rpID = import.meta.env.VITE_PASSKEY_RP_ID ?? "localhost";
  const origin =
    (typeof window !== "undefined" ? window.location.origin : undefined) ??
    import.meta.env.VITE_PASSKEY_ORIGIN ??
    "http://localhost:5174";
  const { signIn, loading, error, supported } = usePasskeys({
    rpName: "Convex Auth Demo",
    rpID,
    origin,
  });

  if (!supported) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Passkey</CardTitle>
        <CardDescription>Sign in with a saved passkey.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Button
          variant="outline"
          onClick={() => void signIn()}
          disabled={loading}
          className="w-full"
        >
          Sign in with passkey
        </Button>
      </CardContent>
    </Card>
  );
}

function DevResetTokenCard({ onToken }: { onToken: (token: string) => void }) {
  const authClient = useConvexAuthClient();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("Requesting…");
    setToken(null);
    const result = await authClient.forgetPassword({
      email,
      redirectTo: window.location.origin,
    });
    if (
      result.error ||
      typeof result.data !== "object" ||
      result.data === null ||
      !("emailId" in result.data)
    ) {
      setStatus(result.error?.message ?? "Could not request reset token");
      return;
    }
    const t = (result.data as { emailId?: string }).emailId ?? "";
    setToken(t);
    setStatus("Token issued — click Use to pre-fill reset form.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Dev: retrieve reset token</CardTitle>
        <CardDescription>Get the token the server would put in a reset email.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="dev-reset-email">Email</Label>
            <Input
              id="dev-reset-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <Button type="submit" variant="outline" className="w-full">
            Request reset token
          </Button>
        </form>
        {token ? (
          <>
            <Separator />
            <div className="bg-muted rounded p-2 break-all font-mono text-xs">{token}</div>
            <Button type="button" onClick={() => onToken(token)} className="w-full">
              Use this token
            </Button>
          </>
        ) : null}
        {status ? <p className="text-muted-foreground text-sm">{status}</p> : null}
      </CardContent>
    </Card>
  );
}
