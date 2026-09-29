import { components } from "./_generated/api";
import { convexAuth, type EmailDraft } from "@vortex-api/convex-auth/convex";
import { env } from "./_generated/server";

const siteUrl =
  env.CONVEX_SITE_URL?.replace(/\/$/, "") ??
  env.SITE_URL?.replace(/\/$/, "") ??
  "http://localhost:3000";

// In a real app, sendEmail should call Resend/Postmark/SES/etc.
// This implementation returns the verification/reset token so the
// conformance suite can drive email flows without a real inbox.
function extractTokenFromEmailDraft(draft: EmailDraft): string | null {
  const source = draft.text || draft.html;
  const match = source.match(/https?:\/\/[^\s<>"]+/);
  if (!match) return null;
  const url = new URL(match[0]);
  const queryToken = url.searchParams.get("token");
  if (queryToken) return queryToken;
  const pathToken = url.pathname.split("/").pop();
  return pathToken && pathToken !== "verify-email" ? pathToken : null;
}

/* TEST-ONLY SEAM — never copy into a real application.
 * When CONVEX_AUTH_TEST_JWKS is set on the deployment, requests to Google's
 * certs endpoint are answered with that keyset so the conformance suite can
 * drive signInOneTap with a locally-signed RS256 token. When unset (the
 * normal case, including any real deployment) the real Google JWKS is used. */
const googleTestJwks = env.CONVEX_AUTH_TEST_JWKS;
const googleTestJwksFetch: typeof fetch | undefined = googleTestJwks
  ? async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "https://www.googleapis.com/oauth2/v3/certs") {
        return new Response(googleTestJwks, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return fetch(input, init);
    }
  : undefined;

export const auth = convexAuth({
  component: components.convexAuth,
  username: { enabled: true },
  phone: {
    /* Conformance seam: the sender echoes the OTP back as the messageId so
     * `convex run` output carries the code — no SMS provider needed. A real
     * app sends the code via Twilio/etc. and returns the provider's ID. */
    sendPhoneOtp: async ({ otp }) => otp,
  },
  oneTap: {
    clientId: env.GOOGLE_CLIENT_ID ?? "",
    ...(googleTestJwksFetch ? { fetchImpl: googleTestJwksFetch } : {}),
  },
  emailAndPassword: {
    enabled: true,
    checkBreach: true,
    // This server forwards caller-supplied `callbackURL`s into the OAuth
    // action — the redirect allowlist must cover the dev origins a demo
    // client may land on.
    trustedOrigins: [
      siteUrl,
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:5174",
    ],
    email: {
      from: env.EMAIL_FROM_ADDRESS ?? "auth@example.com",
      appOrigin: siteUrl,
      sendEmail: async (draft) => {
        const token = extractTokenFromEmailDraft(draft);
        return token ?? "no-token";
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
});

export const {
  signUp,
  signIn,
  signOut,
  updateSession,
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
  isAuthenticated,
  verifySession,
  signInWithRedirect,
  callback,
  signUpUsername,
  signInUsername,
  sendPhoneOtp,
  verifyPhoneOtp,
  signInOneTap,
} = auth;
