import { v } from "convex/values";
import { createFunctionHandle, makeFunctionReference } from "convex/server";
import { internalMutation, internalQuery } from "./_generated/server.js";

const legacyUserValidator = v.object({
  _id: v.optional(v.string()),
  name: v.string(),
  email: v.string(),
  emailVerified: v.boolean(),
  image: v.optional(v.union(v.null(), v.string())),
  createdAt: v.number(),
  updatedAt: v.number(),
  twoFactorEnabled: v.optional(v.union(v.null(), v.boolean())),
  isAnonymous: v.optional(v.union(v.null(), v.boolean())),
  username: v.optional(v.union(v.null(), v.string())),
  displayUsername: v.optional(v.union(v.null(), v.string())),
  phoneNumber: v.optional(v.union(v.null(), v.string())),
  phoneNumberVerified: v.optional(v.union(v.null(), v.boolean())),
  userId: v.optional(v.union(v.null(), v.string())),
});

const legacyAccountValidator = v.object({
  _id: v.optional(v.string()),
  issuer: v.optional(v.union(v.null(), v.string())),
  accountId: v.string(),
  providerId: v.string(),
  userId: v.string(),
  accessToken: v.optional(v.union(v.null(), v.string())),
  refreshToken: v.optional(v.union(v.null(), v.string())),
  idToken: v.optional(v.union(v.null(), v.string())),
  accessTokenExpiresAt: v.optional(v.union(v.null(), v.number())),
  refreshTokenExpiresAt: v.optional(v.union(v.null(), v.number())),
  scope: v.optional(v.union(v.null(), v.string())),
  password: v.optional(v.union(v.null(), v.string())),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const legacySessionValidator = v.object({
  _id: v.optional(v.string()),
  expiresAt: v.number(),
  token: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  ipAddress: v.optional(v.union(v.null(), v.string())),
  userAgent: v.optional(v.union(v.null(), v.string())),
  userId: v.string(),
});

function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

function providerFromLegacy(providerId: string) {
  return providerId === "credential" ? "password" : providerId;
}

function issuerFromLegacy(provider: string, legacyIssuer?: string | null) {
  if (provider === "password") return "native";
  return legacyIssuer ?? `${provider}`;
}

/**
 * Migrate a single Better Auth user into the native `users` table.
 * Idempotent: returns the existing user if the email is already present.
 */
export const migrateUser = internalMutation({
  args: { legacyUser: legacyUserValidator },
  returns: v.object({ userId: v.id("users") }),
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.legacyUser.email);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) {
      return { userId: existing._id };
    }

    const userId = await ctx.db.insert("users", {
      email,
      name: args.legacyUser.name,
      image: args.legacyUser.image ?? undefined,
      emailVerified: args.legacyUser.emailVerified,
      twoFactorEnabled: args.legacyUser.twoFactorEnabled ?? undefined,
      isActive: true,
      createdAt: args.legacyUser.createdAt,
      updatedAt: args.legacyUser.updatedAt,
    });

    return { userId };
  },
});

/**
 * Migrate a single Better Auth account into native `auth_identities` and
 * `authAccounts`.
 */
export const migrateAccount = internalMutation({
  args: {
    legacyAccount: legacyAccountValidator,
    userId: v.id("users"),
    email: v.optional(v.string()),
    emailVerified: v.optional(v.boolean()),
  },
  returns: v.object({ identityId: v.id("auth_identities") }),
  handler: async (ctx, args) => {
    const provider = providerFromLegacy(args.legacyAccount.providerId);
    const issuer = issuerFromLegacy(provider, args.legacyAccount.issuer);
    const subject = provider === "password" ? args.userId : args.legacyAccount.accountId;
    const tokenIdentifier = provider === "password" ? subject : `${issuer}|${subject}`;

    const existing = await ctx.db
      .query("auth_identities")
      .withIndex("by_token_identifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();
    if (existing) {
      return { identityId: existing._id };
    }

    const identityId = await ctx.db.insert("auth_identities", {
      identityId: tokenIdentifier,
      userId: args.userId,
      provider,
      issuer,
      subject,
      tokenIdentifier,
      email: args.email ? normalizeEmail(args.email) : undefined,
      emailVerified: args.emailVerified ?? false,
      sessionId: undefined,
      createdAt: args.legacyAccount.createdAt,
      updatedAt: args.legacyAccount.updatedAt,
    });

    await ctx.db.insert("authAccounts", {
      userId: args.userId,
      provider,
      issuer,
      subject,
      credentialHash: args.legacyAccount.password ?? "",
      accessToken: args.legacyAccount.accessToken ?? undefined,
      refreshToken: args.legacyAccount.refreshToken ?? undefined,
      idToken: args.legacyAccount.idToken ?? undefined,
      tokenType: undefined,
      scopes: args.legacyAccount.scope ? [args.legacyAccount.scope] : undefined,
      accessTokenExpiresAt: args.legacyAccount.accessTokenExpiresAt ?? undefined,
      refreshTokenExpiresAt: args.legacyAccount.refreshTokenExpiresAt ?? undefined,
      createdAt: args.legacyAccount.createdAt,
      updatedAt: args.legacyAccount.updatedAt,
    });

    return { identityId };
  },
});

/**
 * Migrate a single Better Auth session into native `authSessions`.
 */
export const migrateSession = internalMutation({
  args: {
    legacySession: legacySessionValidator,
    userId: v.id("users"),
  },
  returns: v.object({ sessionId: v.id("authSessions") }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("authSessions")
      .withIndex("by_token", (q) => q.eq("token", args.legacySession.token))
      .unique();
    if (existing) {
      return { sessionId: existing._id };
    }

    const sessionId = await ctx.db.insert("authSessions", {
      sessionId: args.legacySession.token,
      userId: args.userId,
      token: args.legacySession.token,
      expiresAt: args.legacySession.expiresAt,
      ipAddress: args.legacySession.ipAddress ?? undefined,
      userAgent: args.legacySession.userAgent ?? undefined,
      revokedAt: undefined,
      createdAt: args.legacySession.createdAt,
      updatedAt: args.legacySession.updatedAt,
    });

    return { sessionId };
  },
});

const migrationHandlesValidator = v.object({
  migrateUser: v.string(),
  migrateAccount: v.string(),
  migrateSession: v.string(),
});

/**
 * Return function handles for the migration writer mutations so an external
 * CLI can wire the vendored adapter's migrateAll runner to convex-auth.
 */
export const getMigrationFunctionHandles = internalQuery({
  args: {},
  returns: migrationHandlesValidator,
  handler: async () => {
    const [migrateUser, migrateAccount, migrateSession] = await Promise.all([
      createFunctionHandle(makeFunctionReference<"mutation">("migrate:migrateUser")),
      createFunctionHandle(makeFunctionReference<"mutation">("migrate:migrateAccount")),
      createFunctionHandle(makeFunctionReference<"mutation">("migrate:migrateSession")),
    ]);
    return { migrateUser, migrateAccount, migrateSession };
  },
});
