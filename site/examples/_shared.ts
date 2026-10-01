// Shared fixtures for docs previews. `.ts` is intentional — blume only
// discovers astro/jsx/svelte/tsx/vue files as examples, so this helper
// never becomes a page itself.
import { createElement, type ReactNode } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import type {
  ConvexBetterAuthClient,
  ConvexAuthSessionListItem,
} from "../../packages/auth/src/react/auth-client-types";
import type { NativeAuthActions } from "../../packages/auth/src/react/ConvexAuthProvider";

// Fixed epoch keeps rendered timestamps identical between SSR and
// hydration (Date.now() would mismatch on `toLocaleString` output).
const now = Date.UTC(2025, 0, 16, 12, 0, 0);
const day = 86400000;

export const MOCK_USER = {
  id: "u1",
  email: "ada@example.com",
  name: "Ada Lovelace",
  image: null,
  emailVerified: true,
  phoneNumber: null,
  phoneNumberVerified: null,
};

export const MOCK_SESSION_STATE = {
  data: {
    session: { id: "sess_1", token: "preview-token" },
    user: MOCK_USER,
  },
  error: null,
  isPending: false,
};

export const MOCK_SESSIONS: ConvexAuthSessionListItem[] = [
  {
    id: "sess_1",
    isCurrent: true,
    userId: "u1",
    ipAddress: "203.0.113.10",
    userAgent: "Safari on macOS",
    createdAt: new Date(now - 3600000).toISOString(),
    updatedAt: new Date(now - 3600000).toISOString(),
    expiresAt: new Date(now + 7 * day).toISOString(),
  },
  {
    id: "sess_2",
    isCurrent: false,
    userId: "u1",
    ipAddress: "198.51.100.23",
    userAgent: "Chrome on Windows",
    createdAt: new Date(now - 3 * day).toISOString(),
    updatedAt: new Date(now - day).toISOString(),
    expiresAt: new Date(now + 4 * day).toISOString(),
  },
];

export const MOCK_ORGANIZATIONS = [
  { _id: "o1", name: "Acme Corp", slug: "acme" },
  { _id: "o2", name: "Globex", slug: "globex" },
  { _id: "o3", name: "Initech", slug: "initech" },
];

export const MOCK_ORG_INVITATIONS = [
  {
    _id: "inv_1",
    organizationName: "Umbrella Corp",
    roleKey: "member",
    email: "ada@example.com",
    expiresAt: now + 3 * day,
  },
];

export const MOCK_MEMBERS = [
  {
    _id: "m1",
    roleTemplate: "owner" as const,
    status: "active" as const,
    createdAt: now - 90 * day,
    user: { _id: "u1", name: "Ada Lovelace", email: "ada@example.com" },
  },
  {
    _id: "m2",
    roleTemplate: "admin" as const,
    status: "active" as const,
    createdAt: now - 60 * day,
    user: { _id: "u2", name: "Grace Hopper", email: "grace@example.com" },
  },
  {
    _id: "m3",
    roleTemplate: "member" as const,
    status: "pending" as const,
    createdAt: now - day,
    user: { _id: "u3", email: "pending@example.com" },
  },
];

export const MOCK_ROLE_OPTIONS = ["owner", "admin", "manager", "member", "viewer"] as const;

export const MOCK_PERMISSIONS = [
  { key: "members:read", description: "View organization members" },
  { key: "members:write", description: "Invite and manage members" },
  { key: "billing:read", description: "View billing details" },
  { key: "billing:write", description: "Manage billing and plans" },
  { key: "settings:write", description: "Edit organization settings" },
];

export const MOCK_ROLES = [
  {
    _id: "r1",
    name: "Admin",
    key: "admin",
    description: "Full access except billing",
    permissions: ["members:read", "members:write", "settings:write"],
    isSystem: true,
  },
  {
    _id: "r2",
    name: "Support",
    key: "support",
    description: "Read-only member access",
    permissions: ["members:read"],
  },
];

export const MOCK_API_KEYS = [
  {
    _id: "k1",
    name: "Production",
    keyPrefix: "vsk_live_a1b2",
    scopes: ["read", "write"] as const,
    allowedIpRanges: [] as const,
    status: "active" as const,
    lastUsedAt: now - 3600000,
    lastUsedIp: "203.0.113.10",
    createdAt: now - 30 * day,
  },
  {
    _id: "k2",
    name: "CI deploys",
    keyPrefix: "vsk_live_c3d4",
    scopes: ["read"] as const,
    allowedIpRanges: ["10.0.0.0/8"] as const,
    status: "active" as const,
    createdAt: now - 60 * day,
  },
  {
    _id: "k3",
    name: "Old laptop",
    keyPrefix: "vsk_live_e5f6",
    scopes: ["read", "write"] as const,
    allowedIpRanges: [] as const,
    status: "revoked" as const,
    createdAt: now - 200 * day,
  },
];

export const MOCK_WEBHOOK_EVENT_OPTIONS = [
  "user.created",
  "user.updated",
  "session.revoked",
  "organization.member_added",
] as const;

export const MOCK_WEBHOOK_ENDPOINTS = [
  {
    _id: "ep1",
    url: "https://api.example.com/webhooks/convex-auth",
    description: "Primary event sink",
    status: "active" as const,
    events: ["user.created", "user.updated"] as const,
    secretPreview: "whsec_••••9f8e",
    createdAt: now - 30 * day,
    updatedAt: now - 2 * day,
  },
  {
    _id: "ep2",
    url: "https://staging.example.com/webhooks/convex-auth",
    description: "Staging sink",
    status: "disabled" as const,
    events: ["session.revoked"] as const,
    secretPreview: "whsec_••••1a2b",
    createdAt: now - 60 * day,
    updatedAt: now - 10 * day,
  },
];

export const MOCK_WEBHOOK_DELIVERIES = [
  {
    _id: "d1",
    endpointId: "ep1",
    organizationId: "o1",
    eventId: "evt_1",
    eventType: "user.created",
    payload: '{"user":{"id":"u9"}}',
    status: "delivered" as const,
    attemptCount: 1,
    deliveredAt: now - 3600000,
    responseStatus: 200,
    createdAt: now - 3600000,
    updatedAt: now - 3600000,
    endpointUrl: "https://api.example.com/webhooks/convex-auth",
  },
  {
    _id: "d2",
    endpointId: "ep1",
    organizationId: "o1",
    eventId: "evt_2",
    eventType: "session.revoked",
    payload: '{"session":{"id":"sess_9"}}',
    status: "failed" as const,
    attemptCount: 3,
    lastAttemptAt: now - 600000,
    nextAttemptAt: now + 600000,
    responseStatus: 500,
    createdAt: now - 3600000,
    updatedAt: now - 600000,
    endpointUrl: "https://api.example.com/webhooks/convex-auth",
  },
];

export const MOCK_EXHAUSTED_WEBHOOK_DELIVERIES = [
  {
    _id: "d3",
    endpointId: "ep2",
    organizationId: "o1",
    eventId: "evt_3",
    eventType: "user.updated",
    payload: '{"user":{"id":"u7"}}',
    status: "failed" as const,
    attemptCount: 8,
    exhaustedAt: now - day,
    responseStatus: 503,
    responseBody: "Service Unavailable",
    failureKind: "server_error" as const,
    createdAt: now - 2 * day,
    updatedAt: now - day,
    endpointUrl: "https://staging.example.com/webhooks/convex-auth",
  },
];

const ok = () => Promise.resolve({ data: null, error: null });

/**
 * Minimal `ConvexBetterAuthClient` stand-in for previews. `useSession` is
 * called during render and returns a signed-in fixture; every other method
 * resolves as an async no-op via the Proxy fallback.
 */
const baseClient = {
  useSession: () => MOCK_SESSION_STATE,
  signOut: ok,
  signIn: {
    email: ok,
    social: ok,
    anonymous: ok,
    username: ok,
    phoneOtp: ok,
    oneTap: ok,
  },
  signUp: { email: ok, username: ok },
  listSessions: async () => ({ data: MOCK_SESSIONS, error: null }),
  revokeSession: ok,
  revokeOtherSessions: ok,
  updateUser: ok,
  forgetPassword: ok,
  resetPassword: ok,
  sendVerificationEmail: ok,
  verifyEmail: ok,
  changeEmail: ok,
  linkAccount: ok,
  signInWithMagicLink: ok,
  signInWithEmailOtp: ok,
  verifyEmailOtp: ok,
  twoFactor: {
    enable: async () => ({
      data: {
        totpURI: "otpauth://totp/Acme:ada@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Acme",
        backupCodes: ["ab12-cd34", "ef56-gh78"],
      },
      error: null,
    }),
    verifyTotp: ok,
    verifyBackupCode: ok,
    disable: ok,
    generateBackupCodes: async () => ({
      data: { backupCodes: ["ab12-cd34", "ef56-gh78"] },
      error: null,
    }),
  },
  convex: { token: async () => ({ data: { token: null } }) },
};

export const mockAuthClient = new Proxy(baseClient, {
  get(target, prop) {
    if (prop in target) return target[prop as keyof typeof target];
    return ok;
  },
}) as unknown as ConvexBetterAuthClient;

/** Placeholder `FunctionReference` — enough for `useQuery`/`useMutation`/`useAction` to mount. */
export const fnRef = (name: string) => name as never;

/**
 * Function references matching `NativeAuthActions`. The provider only calls
 * these on interaction; mounting is enough for a docs preview.
 */
export const mockAuthActions = {
  signUp: fnRef("signUp"),
  signIn: fnRef("signIn"),
  signOut: fnRef("signOut"),
  sendEmailVerification: fnRef("sendEmailVerification"),
  verifyEmail: fnRef("verifyEmail"),
  sendPasswordReset: fnRef("sendPasswordReset"),
  resetPassword: fnRef("resetPassword"),
  verifyPassword: fnRef("verifyPassword"),
  updateSession: fnRef("updateSession"),
  verifySession: fnRef("verifySession"),
  twoFactorVerifyTOTP: fnRef("twoFactorVerifyTOTP"),
  signInMagicLink: fnRef("signInMagicLink"),
  signInWithRedirect: fnRef("signInWithRedirect"),
} as unknown as NativeAuthActions;

/**
 * Dummy Convex client — never connects, so `useQuery` hooks return
 * `undefined` and wired surfaces render their documented loading branch.
 */
export const mockConvexClient = new ConvexReactClient("https://preview.convex.cloud", {
  unsavedChangesWarning: false,
});

/** Wraps children in a Convex context so `useQuery`-based components mount. */
export function ConvexPreviewShell(props: { children?: ReactNode }) {
  return createElement(ConvexProvider, { client: mockConvexClient }, props.children);
}
