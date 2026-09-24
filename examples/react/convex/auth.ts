import { components } from "./_generated/api";
import { convexAuth, type EmailDraft } from "@vortex-api/convex-auth/convex";
import { env } from "./_generated/server";

const siteUrl =
  env.CONVEX_SITE_URL?.replace(/\/$/, "") ??
  env.SITE_URL?.replace(/\/$/, "") ??
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
  if (env.ALLOW_EMAIL_TOKEN_FALLBACK === "true" && token != null) {
    return token;
  }
  throw new Error(
    `${label} not sent: configure an email provider or set ALLOW_EMAIL_TOKEN_FALLBACK=true for local testing.`,
  );
}

export const auth = convexAuth({
  component: components.convexAuth,
  captcha: env.TURNSTILE_SECRET_KEY
    ? {
        provider: "cloudflare-turnstile",
        secretKey: env.TURNSTILE_SECRET_KEY,
      }
    : undefined,
  emailAndPassword: {
    enabled: true,
    checkBreach: true,
    // Redirect allowlist — covers the hosted demo origin (`siteUrl`) plus the
    // local Vite dev origins so `callbackURL: window.location.origin` works
    // from `pnpm dev` too.
    trustedOrigins: [siteUrl, "http://localhost:5173", "http://localhost:5174"],
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
    providers: env.OAUTH_OIDC_CLIENT_ID
      ? {
          oidc: {
            clientId: env.OAUTH_OIDC_CLIENT_ID,
            clientSecret: env.OAUTH_OIDC_CLIENT_SECRET ?? "",
            issuer: env.OAUTH_OIDC_ISSUER ?? "",
            discovery: env.OAUTH_OIDC_DISCOVERY === "true",
            useIdToken: env.OAUTH_OIDC_USE_ID_TOKEN === "true",
            scopes: (env.OAUTH_OIDC_SCOPES ?? "openid,email,profile").split(","),
          },
        }
      : undefined,
  },
  passkey: {
    rpID: "localhost",
    origin: "http://localhost:5174",
    rpName: "Convex Auth Demo",
  },
  anonymous: {
    emailDomain: "guest.convex-auth-demo.local",
    generateName: () => `Guest ${Math.random().toString(36).slice(2, 10)}`,
    onLinkAccount: async ({ anonymousUser, newUser }) => {
      console.log("Linked anonymous user", anonymousUser.id, "to", newUser.id);
    },
  },
  oauthProvider: env.OAUTH_PROVIDER_CLIENT_ID
    ? {
        issuer: siteUrl,
        loginUrl: env.OAUTH_PROVIDER_LOGIN_URL ?? `${siteUrl}/oauth/consent`,
        clients: [
          {
            clientId: env.OAUTH_PROVIDER_CLIENT_ID,
            name: env.OAUTH_PROVIDER_CLIENT_NAME ?? "Demo OIDC Client",
            redirectUris: (env.OAUTH_PROVIDER_REDIRECT_URIS ?? "")
              .split(",")
              .map((uri) => uri.trim())
              .filter(Boolean),
            allowedScopes: (env.OAUTH_PROVIDER_SCOPES ?? "openid,email,profile")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          },
        ],
      }
    : undefined,
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
