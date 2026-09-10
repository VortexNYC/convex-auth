import { components } from "./_generated/api";
import { convexAuth, type EmailDraft } from "convex-auth/convex";

const siteUrl =
  process.env.CONVEX_SITE_URL?.replace(/\/$/, "") ??
  process.env.SITE_URL?.replace(/\/$/, "") ??
  "http://localhost:3000";

// In a real app, sendEmail should call Resend/Postmark/SES/etc.
// In local development without an email provider, you may set
// ALLOW_EMAIL_TOKEN_FALLBACK=true to return the raw token so the UI can
// display it. This is intentionally off by default so a missing provider
// never leaks tokens in production.
function extractTokenFromEmailDraft(draft: EmailDraft): string | null {
  const source = draft.text || draft.html;
  const match = source.match(/https?:\/\/[^\s<>"]+/);
  if (!match) return null;
  const url = new URL(match[0]);
  const pathToken = url.pathname.split("/").pop();
  if (pathToken && pathToken !== "verify-email") return pathToken;
  return url.searchParams.get("token");
}

function fallbackTokenOrThrow(token: string | null, label: string): string {
  if (process.env.ALLOW_EMAIL_TOKEN_FALLBACK === "true" && token != null) {
    return token;
  }
  throw new Error(
    `${label} not sent: configure an email provider or set ALLOW_EMAIL_TOKEN_FALLBACK=true for local testing.`,
  );
}

export const auth = convexAuth({
  component: components.convexAuth,
  captcha: process.env.TURNSTILE_SECRET_KEY
    ? {
        provider: "cloudflare-turnstile",
        secretKey: process.env.TURNSTILE_SECRET_KEY,
      }
    : undefined,
  emailAndPassword: {
    enabled: true,
    checkBreach: true,
    email: {
      from: process.env.EMAIL_FROM_ADDRESS ?? "auth@example.com",
      appOrigin: siteUrl,
      sendEmail: async (draft) => {
        const token = extractTokenFromEmailDraft(draft);
        return fallbackTokenOrThrow(token, "Verification email");
      },
      sendOnSignUp: false,
      sendOnSignIn: false,
    },
  },
  oauth: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
    },
  },
});

export const {
  signUp,
  signIn,
  signOut,
  updateSession,
  updateUser,
  sendEmailVerification,
  verifyEmail,
  sendPasswordReset,
  resetPassword,
  verifyPassword,
  twoFactorEnable,
  twoFactorVerifyTOTP,
  twoFactorVerifyBackupCode,
  twoFactorDisable,
  twoFactorGenerateBackupCodes,
  listSessions,
  revokeSession,
  revokeOtherSessions,
  isAuthenticated,
  verifySession,
  signInWithRedirect,
  callback,
} = auth;
