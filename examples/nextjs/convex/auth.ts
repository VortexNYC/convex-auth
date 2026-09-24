import { components } from "./_generated/api";
import { convexAuth, type EmailDraft } from "@vortex-api/convex-auth/convex";
import { env } from "./_generated/server";

const siteUrl =
  env.CONVEX_SITE_URL?.replace(/\/$/, "") ??
  env.SITE_URL?.replace(/\/$/, "") ??
  "http://localhost:3000";

// In a real app, sendEmail should call Resend/Postmark/SES/etc.
// In local development without an email provider, set
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
  if (env.ALLOW_EMAIL_TOKEN_FALLBACK === "true" && token != null) {
    return token;
  }
  throw new Error(
    `${label} not sent: configure an email provider or set ALLOW_EMAIL_TOKEN_FALLBACK=true for local testing.`,
  );
}

export const auth = convexAuth({
  component: components.convexAuth,
  emailAndPassword: {
    enabled: true,
    checkBreach: true,
    // Redirect allowlist — the Next.js app origin for local dev. `SITE_URL`
    // is also merged when set (see README step: `convex env set SITE_URL`).
    trustedOrigins: [siteUrl, "http://localhost:3000"],
    email: {
      from: env.EMAIL_FROM_ADDRESS ?? "auth@example.com",
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
      clientId: env.GITHUB_CLIENT_ID ?? "",
      clientSecret: env.GITHUB_CLIENT_SECRET ?? "",
    },
    google: {
      clientId: env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
    },
    discord: {
      clientId: env.DISCORD_CLIENT_ID ?? "",
      clientSecret: env.DISCORD_CLIENT_SECRET ?? "",
    },
  },
  passkey: {
    // rpID must be the bare hostname (no scheme/port) of `origin`.
    rpID: new URL(siteUrl).hostname,
    origin: siteUrl,
    rpName: "Convex Auth Next.js Demo",
  },
  anonymous: {
    emailDomain: "guest.convex-auth-demo.local",
    generateName: () => `Guest ${Math.random().toString(36).slice(2, 10)}`,
    onLinkAccount: async ({ anonymousUser, newUser }) => {
      console.log("Linked anonymous user", anonymousUser.id, "to", newUser.id);
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
  getPasskeyRegistrationOptions,
  verifyPasskeyRegistration,
  getPasskeyAuthenticationOptions,
  verifyPasskeyAuthentication,
  listPasskeys,
  revokePasskey,
  renamePasskey,
  verifySession,
  signInWithRedirect,
  callback,
  signInAnonymous,
  linkAnonymousAccount,
} = auth;
