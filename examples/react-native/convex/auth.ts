import { components } from "./_generated/api";
import { convexAuth, type EmailDraft } from "@vortex-api/convex-auth/convex";

const siteUrl =
  process.env.CONVEX_SITE_URL?.replace(/\/$/, "") ??
  process.env.SITE_URL?.replace(/\/$/, "") ??
  "http://localhost:3000";

// In a real app, sendEmail should call Resend/Postmark/SES/etc.
// This implementation returns the verification/reset token so the
// conformance suite can drive email flows without a real inbox.
function extractTokenFromEmailDraft(draft: EmailDraft): string | null {
  const source = draft.text || draft.html;
  const match = source.match(/https?:\/\/[^\s<>"]+/);
  if (!match) return null;
  const url = new URL(match[0]);
  const pathToken = url.pathname.split("/").pop();
  if (pathToken && pathToken !== "verify-email" && pathToken !== "reset-password") {
    return pathToken;
  }
  return url.searchParams.get("token");
}

export const auth = convexAuth({
  component: components.convexAuth,
  emailAndPassword: {
    enabled: true,
    checkBreach: true,
    email: {
      from: process.env.EMAIL_FROM_ADDRESS ?? "auth@example.com",
      appOrigin: siteUrl,
      sendEmail: async (draft) => {
        const token = extractTokenFromEmailDraft(draft);
        return token ?? "no-token";
      },
      sendOnSignUp: false,
      sendOnSignIn: false,
    },
  },
  anonymous: {
    emailDomain: "guest.convex-auth-demo.local",
    generateName: () => `Guest ${Math.random().toString(36).slice(2, 10)}`,
  },
  passkey: {
    // Defaults to the .convex.site host — the well-known routes in http.ts
    // serve the AASA/assetlinks files on that domain, so native passkeys work
    // with no external website. Set PASSKEY_RP_ID for a custom domain.
    rpID: process.env.PASSKEY_RP_ID ?? new URL(siteUrl).hostname,
    // Comma-separated list covering every origin platforms may emit: the site
    // origin plus "android:apk-key-hash:<base64url-sha256-of-signing-cert>".
    origin: (process.env.PASSKEY_ORIGINS ?? new URL(siteUrl).origin)
      .split(",")
      .map((o: string) => o.trim())
      .filter(Boolean),
    rpName: "Convex Auth Demo",
  },
  oauth: {
    // Deep-link landing targets — the app scheme (dev-client/standalone builds
    // via `Linking.createURL`) and Expo Go's `exp://` URLs. These have no
    // WHATWG origin, so the redirect allowlist only admits them through
    // explicit scheme patterns (same set `buildExpoTrustedOrigins` emits).
    trustedOrigins: ["convex-auth-rn://", "exp://", "exp://**", "exp://192.168.*.*:*/**"],
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
  signInAnonymous,
  linkAnonymousAccount,
  getPasskeyRegistrationOptions,
  verifyPasskeyRegistration,
  getPasskeyAuthenticationOptions,
  verifyPasskeyAuthentication,
  listPasskeys,
  revokePasskey,
  renamePasskey,
} = auth;
