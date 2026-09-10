import { components } from "./_generated/api";
import {
  convexAuth,
  createResendEmailOtpSender,
  createResendEmailSender,
  type EmailDraft,
} from "@vortex-api/convex-auth/convex";

const siteUrl =
  process.env.CONVEX_SITE_URL?.replace(/\/$/, "") ??
  process.env.SITE_URL?.replace(/\/$/, "") ??
  "http://localhost:3000";

const resendApiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.EMAIL_FROM_ADDRESS ?? "auth@example.com";
const useResend = resendApiKey != null && resendApiKey !== "";
const resendEmailSender = useResend
  ? createResendEmailSender({ apiKey: resendApiKey, from: fromAddress })
  : null;
const resendOtpSender = useResend
  ? createResendEmailOtpSender({ apiKey: resendApiKey, from: fromAddress })
  : null;

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
    `${label} not sent: configure RESEND_API_KEY or set ALLOW_EMAIL_TOKEN_FALLBACK=true for local testing.`,
  );
}

export const auth = convexAuth({
  component: components.convexAuth,
  emailAndPassword: {
    enabled: true,
    checkBreach: true,
    trustedOrigins: [siteUrl, "http://localhost:5173"],
    email: {
      from: fromAddress,
      appOrigin: siteUrl,
      sendEmail: async (draft) => {
        if (resendEmailSender) {
          return resendEmailSender(draft);
        }
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
  magicLink: {
    enabled: true,
    appOrigin: siteUrl,
    sendMagicLink: async ({ email, token, url }) => {
      if (resendEmailSender) {
        return resendEmailSender({
          from: fromAddress,
          to: email,
          subject: "Sign in to the convex-auth OAuth example",
          html: `<!doctype html><html><body><p>Click the link below to finish signing in:</p><a href="${url}">${url}</a></body></html>`,
          text: `Sign in to the convex-auth OAuth example: ${url}`,
        });
      }
      return fallbackTokenOrThrow(token, "Magic link");
    },
  },
  emailOtp: {
    enabled: true,
    sendVerificationOTP: async ({ email, otp, type }) => {
      if (resendOtpSender) {
        return resendOtpSender({ email, otp, type });
      }
      return fallbackTokenOrThrow(otp, "Verification OTP");
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
  signInMagicLink,
  verifyMagicLink,
  sendVerificationOtp,
  verifyEmailOtp,
} = auth;
