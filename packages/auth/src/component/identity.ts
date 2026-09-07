import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { getPage } from "convex-helpers/server/pagination";
import { getOneFrom } from "convex-helpers/server/relationships";
import { mutation, query } from "./_generated/server.js";
import { mintToken } from "../convex-runtime/native/jwt.js";
import schema, {
  emailTwoFactorResetReasonValidator,
  emailTwoFactorStatusValidator,
} from "./schema.js";

const MAX_EMAIL_VERIFICATION_CODE_REVOKE_BATCH = 100;
const MAX_PASSWORD_RESET_SESSION_REVOKE_BATCH = 1000;

type IdentityLookupCtx = Pick<MutationCtx | QueryCtx, "db">;

const identityInputValidator = v.object({
  identityId: v.string(),
  provider: v.string(),
  issuer: v.string(),
  subject: v.string(),
  tokenIdentifier: v.string(),
  email: v.optional(v.string()),
  emailVerified: v.boolean(),
  sessionId: v.optional(v.union(v.string(), v.null())),
});

const userProfileInputValidator = v.object({
  email: v.optional(v.string()),
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  emailVerified: v.boolean(),
});

const accountInputValidator = v.object({
  credentialHash: v.string(),
});

const verificationCodeInputValidator = v.object({
  tokenHash: v.string(),
  expiresAt: v.number(),
});

const initialSessionInputValidator = v.object({
  sessionId: v.string(),
  sessionExpiresAt: v.number(),
  refreshTokenHash: v.string(),
  refreshTokenExpiresAt: v.number(),
});

const userReturnValidator = v.object({
  _id: v.id("users"),
  email: v.optional(v.string()),
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  emailVerified: v.boolean(),
  emailTwoFactorStatus: v.optional(emailTwoFactorStatusValidator),
  emailTwoFactorEmail: v.optional(v.string()),
  emailTwoFactorEnabledAt: v.optional(v.number()),
  emailTwoFactorDisabledAt: v.optional(v.number()),
  emailTwoFactorLastVerifiedAt: v.optional(v.number()),
  emailTwoFactorResetAt: v.optional(v.number()),
  emailTwoFactorResetReason: v.optional(emailTwoFactorResetReasonValidator),
  activeOrganizationId: v.optional(v.id("organizations")),
  twoFactorEnabled: v.optional(v.boolean()),
  isActive: v.boolean(),
  isSuperAdmin: v.optional(v.boolean()),
  metadataJson: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const provisionResultValidator = v.object({
  userId: v.id("users"),
  identityId: v.optional(v.id("auth_identities")),
  createdUser: v.boolean(),
  linkedExistingIdentity: v.boolean(),
  duplicate: v.optional(v.boolean()),
  user: v.optional(userReturnValidator),
  sessionId: v.optional(v.string()),
  token: v.optional(v.string()),
});

const identityLookupResultValidator = v.union(
  v.object({
    userId: v.id("users"),
    identityId: v.id("auth_identities"),
    identityKey: v.string(),
    email: v.optional(v.string()),
    emailVerified: v.boolean(),
  }),
  v.null(),
);

const listedIdentityValidator = v.object({
  identityId: v.id("auth_identities"),
  provider: v.string(),
  issuer: v.string(),
  subject: v.string(),
  email: v.optional(v.string()),
  emailVerified: v.boolean(),
});

const userAndAccountIdentityValidator = v.object({
  _id: v.id("auth_identities"),
  userId: v.id("users"),
  provider: v.string(),
  issuer: v.string(),
  subject: v.string(),
  email: v.optional(v.string()),
  emailVerified: v.boolean(),
});

const userAndAccountAccountValidator = v.object({
  _id: v.id("authAccounts"),
  userId: v.id("users"),
  provider: v.string(),
  issuer: v.string(),
  subject: v.string(),
  credentialHash: v.string(),
});

const userAndAccountResultValidator = v.union(
  v.null(),
  v.object({
    user: userReturnValidator,
    identity: userAndAccountIdentityValidator,
    account: userAndAccountAccountValidator,
  }),
);

const emailVerificationResultValidator = v.object({
  success: v.boolean(),
  user: v.optional(userReturnValidator),
  reason: v.optional(v.string()),
});

const passwordResetResultValidator = v.object({
  status: v.boolean(),
  user: v.optional(userReturnValidator),
  reason: v.optional(v.string()),
});

export const provisionFromIdentity = mutation({
  args: {
    identity: identityInputValidator,
    user: userProfileInputValidator,
    account: v.optional(accountInputValidator),
    verificationCode: v.optional(verificationCodeInputValidator),
    initialSession: v.optional(initialSessionInputValidator),
    allowLink: v.optional(v.boolean()),
  },
  returns: provisionResultValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    let token: string | undefined;
    const normalizedEmail = normalizeEmail(args.user.email ?? args.identity.email);
    const allowLink = args.allowLink ?? true;
    const existingIdentity =
      (await findIdentityByIdentityId(ctx, args.identity.identityId)) ??
      (await findIdentityByProviderIssuerSubject(ctx, {
        provider: args.identity.provider,
        issuer: args.identity.issuer,
        subject: args.identity.subject,
      }));
    const existingUserByIdentity = existingIdentity
      ? await ctx.db.get("users", existingIdentity.userId)
      : null;
    const existingUserByEmail = normalizedEmail
      ? await getOneFrom(ctx.db, "users", "by_email", normalizedEmail, "email")
      : null;
    const user = existingUserByIdentity ?? existingUserByEmail;

    if (!allowLink && existingUserByEmail && !existingIdentity) {
      const { page: identitiesForUser } = await getPage(ctx, {
        table: "auth_identities",
        index: "by_user",
        startIndexKey: [existingUserByEmail._id],
        endIndexKey: [existingUserByEmail._id],
        absoluteMaxRows: 1,
        schema,
      });
      return {
        userId: existingUserByEmail._id,
        identityId: identitiesForUser[0]?._id,
        createdUser: false,
        linkedExistingIdentity: false,
        duplicate: true,
        user: toUserReturn(existingUserByEmail),
      };
    }

    const userPatch = {
      email: normalizedEmail ?? undefined,
      name: args.user.name,
      image: args.user.image,
      emailVerified: args.user.emailVerified,
      isActive: true,
      updatedAt: now,
    };

    const userId =
      user?._id ??
      (await ctx.db.insert("users", {
        ...userPatch,
        createdAt: now,
      }));

    if (user) {
      await ctx.db.patch("users", user._id, userPatch);
    }

    const identityPatch = {
      identityId: args.identity.identityId,
      userId,
      provider: args.identity.provider,
      issuer: args.identity.issuer,
      subject: args.identity.subject,
      tokenIdentifier: args.identity.tokenIdentifier,
      email: normalizeEmail(args.identity.email) ?? undefined,
      emailVerified: args.identity.emailVerified,
      sessionId: args.identity.sessionId ?? null,
      updatedAt: now,
    };

    if (existingIdentity) {
      await ctx.db.patch("auth_identities", existingIdentity._id, identityPatch);
      const userRecord = await ctx.db.get("users", userId);
      return {
        userId,
        identityId: existingIdentity._id,
        createdUser: false,
        linkedExistingIdentity: true,
        user: userRecord ? toUserReturn(userRecord) : undefined,
      };
    }

    const identityId = await ctx.db.insert("auth_identities", {
      ...identityPatch,
      createdAt: now,
    });

    if (args.account) {
      await ctx.db.insert("authAccounts", {
        userId,
        provider: args.identity.provider,
        issuer: args.identity.issuer,
        subject: args.identity.subject,
        credentialHash: args.account.credentialHash,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (args.initialSession) {
      const sessionExpiresInSeconds = Math.max(
        0,
        Math.floor((args.initialSession.sessionExpiresAt - now) / 1000),
      );
      token = await mintToken(
        userId,
        args.initialSession.sessionId,
        { identityId },
        { expiresInSeconds: sessionExpiresInSeconds },
      );
      await ctx.db.insert("authRefreshTokens", {
        tokenHash: args.initialSession.refreshTokenHash,
        sessionId: args.initialSession.sessionId,
        userId,
        expiresAt: args.initialSession.refreshTokenExpiresAt,
        revokedAt: undefined,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("authSessions", {
        sessionId: args.initialSession.sessionId,
        userId,
        token,
        expiresAt: args.initialSession.sessionExpiresAt,
        ipAddress: undefined,
        userAgent: undefined,
        revokedAt: undefined,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (args.verificationCode) {
      const { page: existingCodes } = await getPage(ctx, {
        table: "authVerificationCodes",
        index: "by_user_type",
        startIndexKey: [userId, "email_verification"],
        endIndexKey: [userId, "email_verification"],
        absoluteMaxRows: MAX_EMAIL_VERIFICATION_CODE_REVOKE_BATCH,
        schema,
      });
      await Promise.all(
        existingCodes.map((code) => ctx.db.patch(code._id, { consumedAt: now, updatedAt: now })),
      );
      await ctx.db.insert("authVerificationCodes", {
        userId,
        type: "email_verification",
        tokenHash: args.verificationCode.tokenHash,
        expiresAt: args.verificationCode.expiresAt,
        consumedAt: undefined,
        createdAt: now,
        updatedAt: now,
      });
    }

    const userRecord = await ctx.db.get("users", userId);
    return {
      userId,
      identityId,
      createdUser: user === null,
      linkedExistingIdentity: false,
      user: userRecord ? toUserReturn(userRecord) : undefined,
      sessionId: args.initialSession?.sessionId,
      token,
    };
  },
});

export const getUserAndAccount = query({
  args: { email: v.string() },
  returns: userAndAccountResultValidator,
  handler: async (ctx, args) => {
    const normalizedEmail = normalizeEmail(args.email);
    if (!normalizedEmail) {
      return null;
    }
    const user = await getOneFrom(ctx.db, "users", "by_email", normalizedEmail, "email");
    if (!user) {
      return null;
    }
    const identity = await findIdentityByUserAndProvider(ctx, {
      userId: user._id,
      provider: "password",
      issuer: "native",
    });
    if (!identity) {
      return null;
    }
    const account = await findAccountByProviderIssuerSubject(ctx, {
      provider: "password",
      issuer: "native",
      subject: identity.subject,
    });
    if (!account) {
      return null;
    }
    return {
      user: toUserReturn(user),
      identity: toIdentityReturn(identity),
      account: toAccountReturn(account),
    };
  },
});

export const verifyEmail = mutation({
  args: {
    tokenHash: v.string(),
    provider: v.string(),
    issuer: v.string(),
  },
  returns: emailVerificationResultValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const code = await findVerificationCodeByTokenHashAndType(
      ctx,
      args.tokenHash,
      "email_verification",
    );

    if (!code) {
      return { success: false, reason: "invalid" };
    }

    if (code.consumedAt || code.expiresAt <= now) {
      return { success: false, reason: "expired" };
    }

    const identity = await findIdentityByUserAndProvider(ctx, {
      userId: code.userId,
      provider: args.provider,
      issuer: args.issuer,
    });

    if (identity) {
      await ctx.db.patch(identity._id, { emailVerified: true, updatedAt: now });
    }

    await ctx.db.patch("users", code.userId, { emailVerified: true, updatedAt: now });
    await ctx.db.patch(code._id, { consumedAt: now, updatedAt: now });

    const userRecord = await ctx.db.get("users", code.userId);
    return { success: true, user: userRecord ? toUserReturn(userRecord) : undefined };
  },
});

export const resetPassword = mutation({
  args: {
    tokenHash: v.string(),
    credentialHash: v.string(),
    provider: v.string(),
    issuer: v.string(),
    revokeSessions: v.optional(v.boolean()),
  },
  returns: passwordResetResultValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const code = await findVerificationCodeByTokenHashAndType(
      ctx,
      args.tokenHash,
      "password_reset",
    );

    if (!code || code.consumedAt || code.expiresAt <= now) {
      return { status: false, reason: !code ? "invalid" : "expired" };
    }

    const identity = await findIdentityByUserAndProvider(ctx, {
      userId: code.userId,
      provider: args.provider,
      issuer: args.issuer,
    });
    if (!identity) {
      return { status: false, reason: "invalid" };
    }

    const account = await findAccountByProviderIssuerSubject(ctx, {
      provider: args.provider,
      issuer: args.issuer,
      subject: identity.subject,
    });
    if (!account) {
      return { status: false, reason: "invalid" };
    }

    const writes: Promise<unknown>[] = [
      ctx.db.patch(code._id, { consumedAt: now, updatedAt: now }),
      ctx.db.patch(account._id, { credentialHash: args.credentialHash, updatedAt: now }),
    ];

    if (args.revokeSessions) {
      const { page: sessions } = await getPage(ctx, {
        table: "authSessions",
        index: "by_user",
        startIndexKey: [code.userId],
        endIndexKey: [code.userId],
        absoluteMaxRows: MAX_PASSWORD_RESET_SESSION_REVOKE_BATCH,
        schema,
      });

      for (const session of sessions) {
        if (session.revokedAt === undefined && session.expiresAt > now) {
          writes.push(ctx.db.patch(session._id, { revokedAt: now, updatedAt: now }));
        }
      }
    }

    await Promise.all(writes);

    const userRecord = await ctx.db.get("users", code.userId);
    return { status: true, user: userRecord ? toUserReturn(userRecord) : undefined };
  },
});

const changeEmailResultValidator = v.object({
  status: v.boolean(),
  user: v.optional(userReturnValidator),
  reason: v.optional(v.string()),
});

export const changeEmail = mutation({
  args: {
    tokenHash: v.string(),
    newEmail: v.string(),
  },
  returns: changeEmailResultValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const normalizedEmail = normalizeEmail(args.newEmail);
    if (!normalizedEmail) {
      return { status: false, reason: "invalid_email" };
    }

    const code = await ctx.db
      .query("authVerificationCodes")
      .withIndex("by_token_hash", (q) =>
        q.eq("tokenHash", args.tokenHash).eq("type", "email_change"),
      )
      .unique();

    if (!code) {
      return { status: false, reason: "invalid" };
    }

    if (code.consumedAt || code.expiresAt <= now) {
      return { status: false, reason: "expired" };
    }

    const user = await ctx.db.get("users", code.userId);
    if (!user) {
      return { status: false, reason: "invalid" };
    }

    if (user.email && user.email.toLowerCase().trim() === normalizedEmail) {
      return { status: false, reason: "same_email" };
    }

    const existingUserByEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .unique();

    if (existingUserByEmail && existingUserByEmail._id !== user._id) {
      return { status: false, reason: "email_in_use" };
    }

    const emailOtpIdentity = await findIdentityByUserAndProvider(ctx, {
      userId: user._id,
      provider: "emailOtp",
      issuer: "native",
    });

    const passwordIdentity = await findIdentityByUserAndProvider(ctx, {
      userId: user._id,
      provider: "password",
      issuer: "native",
    });

    const writes: Promise<unknown>[] = [
      ctx.db.patch(code._id, { consumedAt: now, updatedAt: now }),
      ctx.db.patch("users", user._id, {
        email: normalizedEmail,
        emailVerified: true,
        updatedAt: now,
      }),
    ];

    if (emailOtpIdentity) {
      writes.push(
        ctx.db.patch(emailOtpIdentity._id, {
          subject: normalizedEmail,
          tokenIdentifier: normalizedEmail,
          email: normalizedEmail,
          emailVerified: true,
          updatedAt: now,
        }),
      );
    }

    if (passwordIdentity) {
      writes.push(
        ctx.db.patch(passwordIdentity._id, {
          email: normalizedEmail,
          emailVerified: true,
          updatedAt: now,
        }),
      );
    }

    await Promise.all(writes);

    const userRecord = await ctx.db.get("users", user._id);
    return { status: true, user: userRecord ? toUserReturn(userRecord) : undefined };
  },
});

export const getByIdentity = query({
  args: {
    provider: v.string(),
    issuer: v.string(),
    subject: v.string(),
  },
  returns: identityLookupResultValidator,
  handler: async (ctx, args) => {
    const identity = await findIdentityByProviderIssuerSubject(ctx, args);
    return identity === null ? null : toIdentityLookupResult(identity);
  },
});

/**
 * List every identity row linked to the given component user. Used by
 * consumers that hold a component `userId` (e.g. from a membership row) and
 * need to recover the JWT subject/provider triple — for example, to surface
 * member lists keyed on the consumer's local identifier space, or to mint a
 * back-reference into the consumer's own users table.
 */
export const listByUser = query({
  args: {
    userId: v.id("users"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(listedIdentityValidator),
  handler: async (ctx, { userId, paginationOpts }) => {
    const result = await ctx.db
      .query("auth_identities")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .paginate(paginationOpts);
    return {
      ...result,
      page: result.page.map((row) => ({
        identityId: row._id,
        provider: row.provider,
        issuer: row.issuer,
        subject: row.subject,
        email: row.email,
        emailVerified: row.emailVerified,
      })),
    };
  },
});

export const getByTokenIdentifier = query({
  args: {
    tokenIdentifier: v.string(),
  },
  returns: identityLookupResultValidator,
  handler: async (ctx, args) => {
    const identity = await getOneFrom(
      ctx.db,
      "auth_identities",
      "by_token_identifier",
      args.tokenIdentifier,
      "tokenIdentifier",
    );
    return identity === null ? null : toIdentityLookupResult(identity);
  },
});

async function findIdentityByIdentityId(ctx: IdentityLookupCtx, identityId: string) {
  return await getOneFrom(ctx.db, "auth_identities", "by_identity_id", identityId, "identityId");
}

async function findIdentityByProviderIssuerSubject(
  ctx: { db: QueryCtx["db"] },
  args: { provider: string; issuer: string; subject: string },
) {
  const { page } = await getPage(ctx, {
    table: "auth_identities",
    index: "by_provider_issuer_subject",
    startIndexKey: [args.provider, args.issuer, args.subject],
    endIndexKey: [args.provider, args.issuer, args.subject],
    absoluteMaxRows: 1,
    schema,
  });
  return page[0] ?? null;
}

function toIdentityLookupResult(identity: Doc<"auth_identities">) {
  return {
    userId: identity.userId,
    identityId: identity._id,
    identityKey: identity.identityId,
    email: identity.email,
    emailVerified: identity.emailVerified,
  };
}

function normalizeEmail(email: string | undefined): string | undefined {
  const normalized = email?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

async function findVerificationCodeByTokenHashAndType(
  ctx: { db: QueryCtx["db"] },
  tokenHash: string,
  type: string,
) {
  const { page } = await getPage(ctx, {
    table: "authVerificationCodes",
    index: "by_token_hash",
    startIndexKey: [tokenHash, type],
    endIndexKey: [tokenHash, type],
    absoluteMaxRows: 1,
    schema,
  });
  return page[0] ?? null;
}

async function findAccountByProviderIssuerSubject(
  ctx: { db: QueryCtx["db"] },
  args: { provider: string; issuer: string; subject: string },
) {
  const { page } = await getPage(ctx, {
    table: "authAccounts",
    index: "by_provider_issuer_subject",
    startIndexKey: [args.provider, args.issuer, args.subject],
    endIndexKey: [args.provider, args.issuer, args.subject],
    absoluteMaxRows: 1,
    schema,
  });
  return page[0] ?? null;
}

async function findIdentityByUserAndProvider(
  ctx: { db: QueryCtx["db"] },
  args: { userId: Id<"users">; provider: string; issuer: string },
) {
  const { page } = await getPage(ctx, {
    table: "auth_identities",
    index: "by_user_provider_issuer",
    startIndexKey: [args.userId, args.provider, args.issuer],
    endIndexKey: [args.userId, args.provider, args.issuer],
    absoluteMaxRows: 1,
    schema,
  });
  return page[0] ?? null;
}

function toIdentityReturn(identity: Doc<"auth_identities">) {
  return {
    _id: identity._id,
    userId: identity.userId,
    provider: identity.provider,
    issuer: identity.issuer,
    subject: identity.subject,
    email: identity.email,
    emailVerified: identity.emailVerified,
  };
}

function toAccountReturn(account: Doc<"authAccounts">) {
  return {
    _id: account._id,
    userId: account.userId,
    provider: account.provider,
    issuer: account.issuer,
    subject: account.subject,
    credentialHash: account.credentialHash,
  };
}

function toUserReturn(user: Doc<"users">) {
  return {
    _id: user._id,
    email: user.email,
    name: user.name,
    image: user.image,
    emailVerified: user.emailVerified,
    emailTwoFactorStatus: user.emailTwoFactorStatus,
    emailTwoFactorEmail: user.emailTwoFactorEmail,
    emailTwoFactorEnabledAt: user.emailTwoFactorEnabledAt,
    emailTwoFactorDisabledAt: user.emailTwoFactorDisabledAt,
    emailTwoFactorLastVerifiedAt: user.emailTwoFactorLastVerifiedAt,
    emailTwoFactorResetAt: user.emailTwoFactorResetAt,
    emailTwoFactorResetReason: user.emailTwoFactorResetReason,
    twoFactorEnabled: user.twoFactorEnabled,
    activeOrganizationId: user.activeOrganizationId,
    isActive: user.isActive,
    isSuperAdmin: user.isSuperAdmin,
    metadataJson: user.metadataJson,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
