import { components } from "./_generated/api";
import { convexAuth, type EmailDraft } from "@vortex-api/convex-auth/convex";

const siteUrl =
  process.env.CONVEX_SITE_URL?.replace(/\/$/, "") ??
  process.env.SITE_URL?.replace(/\/$/, "") ??
  "http://localhost:3200";

export const auth = convexAuth({
  component: components.convexAuth,
  emailAndPassword: {
    enabled: true,
    checkBreach: true,
    email: {
      from: process.env.EMAIL_FROM_ADDRESS ?? "auth@example.com",
      appOrigin: siteUrl,
      // Local demo: log verification emails instead of sending them.
      sendEmail: async (draft: EmailDraft) => {
        console.log("Email draft:", draft.subject, draft.text ?? draft.html);
        return "demo-email-id";
      },
      sendOnSignUp: false,
      sendOnSignIn: false,
    },
  },
  anonymous: {
    emailDomain: "guest.convex-auth-demo.local",
    generateName: () => `Guest ${Math.random().toString(36).slice(2, 10)}`,
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
  listSessions,
  revokeSession,
  revokeOtherSessions,
  isAuthenticated,
  verifySession,
  signInAnonymous,
  linkAnonymousAccount,
} = auth;
