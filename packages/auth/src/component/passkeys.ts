import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server.js";
import { v } from "convex/values";
import { getPage } from "convex-helpers/server/pagination";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { bytesToBase64url, base64urlToBytes } from "../convex-runtime/native/password.js";
import { mintToken } from "../convex-runtime/native/jwt.js";
import { generateVerificationToken, hashToken } from "../convex-runtime/native/tokens.js";
import schema from "./schema.js";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_PASSKEYS_PER_USER = 10;
const EXPIRED_CHALLENGE_BATCH = 50;
const MAX_USER_PASSKEY_ROWS = 10_000;
const MAX_FAMILY_MEMBERS = 1000;

async function deleteExpiredChallenges(ctx: { db: MutationCtx["db"] }, now: number) {
  const expired = await ctx.db
    .query("auth_passkey_challenges")
    .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
    .take(EXPIRED_CHALLENGE_BATCH);
  await Promise.all(expired.map((row) => ctx.db.delete(row._id)));
}

async function getUserPasskeys(ctx: { db: QueryCtx["db"] }, userId: string) {
  const { page } = await getPage(ctx, {
    table: "auth_passkeys",
    index: "by_userId",
    startIndexKey: [userId],
    endIndexKey: [userId],
    absoluteMaxRows: MAX_USER_PASSKEY_ROWS,
    schema,
  });
  return page;
}

async function revokePasskeySessions(
  ctx: { db: MutationCtx["db"] },
  passkey: { userId: string; credentialId: string },
  now: number,
) {
  const { page: userSessions } = await getPage(ctx, {
    table: "authSessions",
    index: "by_user",
    startIndexKey: [passkey.userId],
    endIndexKey: [passkey.userId],
    absoluteMaxRows: MAX_FAMILY_MEMBERS,
    schema,
  });
  const familyIds = new Set(
    userSessions
      .filter((s) => s.credentialId === passkey.credentialId)
      .map((s) => s.familyId ?? s.sessionId),
  );
  for (const familyId of familyIds) {
    const [{ page: familySessions }, { page: familyTokens }] = await Promise.all([
      getPage(ctx, {
        table: "authSessions",
        index: "by_family",
        startIndexKey: [familyId],
        endIndexKey: [familyId],
        absoluteMaxRows: MAX_FAMILY_MEMBERS,
        schema,
      }),
      getPage(ctx, {
        table: "authRefreshTokens",
        index: "by_family",
        startIndexKey: [familyId],
        endIndexKey: [familyId],
        absoluteMaxRows: MAX_FAMILY_MEMBERS,
        schema,
      }),
    ]);
    for (const doc of [...familySessions, ...familyTokens]) {
      if (!doc.revokedAt) {
        await ctx.db.patch(doc._id, { revokedAt: now, updatedAt: now });
      }
    }
  }
  return familyIds.size;
}

function signCountFromAuthData(authenticatorData: string): number | null {
  try {
    const bytes = base64urlToBytes(authenticatorData);
    if (bytes.length < 37) return null;
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(33, false);
  } catch {
    return null;
  }
}

const registrationResponseValidator = v.object({
  id: v.string(),
  rawId: v.string(),
  response: v.object({
    clientDataJSON: v.string(),
    attestationObject: v.string(),
    authenticatorData: v.optional(v.string()),
    publicKey: v.optional(v.string()),
    publicKeyAlgorithm: v.optional(v.number()),
    transports: v.optional(v.array(v.string())),
  }),
  clientExtensionResults: v.optional(v.record(v.string(), v.any())),
  type: v.optional(v.string()),
  authenticatorAttachment: v.optional(v.string()),
});

export const generatePasskeyRegistrationOptions = mutation({
  args: {
    userId: v.id("users"),
    identifier: v.string(),
    displayName: v.optional(v.string()),
    rpName: v.string(),
    rpID: v.string(),
    origin: v.optional(v.union(v.string(), v.array(v.string()))),
    userVerification: v.optional(
      v.union(v.literal("required"), v.literal("preferred"), v.literal("discouraged")),
    ),
    authenticatorAttachment: v.optional(
      v.union(v.literal("platform"), v.literal("cross-platform")),
    ),
    residentKey: v.optional(
      v.union(v.literal("required"), v.literal("preferred"), v.literal("discouraged")),
    ),
    attestationType: v.optional(
      v.union(v.literal("none"), v.literal("direct"), v.literal("enterprise")),
    ),
    maxPasskeys: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const now = Date.now();
    await deleteExpiredChallenges(ctx, now);
    const challengeBytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(challengeBytes);
    const challenge = bytesToBase64url(challengeBytes);

    const maxPasskeys = args.maxPasskeys ?? MAX_PASSKEYS_PER_USER;
    const existing = await getUserPasskeys(ctx, args.userId);

    const active = existing.filter((pk) => !pk.revokedAt);
    if (active.length >= maxPasskeys) {
      throw new Error("Maximum number of passkeys reached for this user");
    }

    const user = await ctx.db.get("users", args.userId);
    if (!user) {
      throw new Error("User not found");
    }
    const identifier = user.email ?? args.identifier;

    const excludeCredentials = active.map((pk) => ({
      id: pk.credentialId,
      transports: pk.transports ?? [],
    }));

    const options = await generateRegistrationOptions({
      rpName: args.rpName,
      rpID: args.rpID,
      userName: identifier,
      userDisplayName: args.displayName ?? identifier,
      challenge,
      attestationType: args.attestationType ?? "none",
      excludeCredentials,
      authenticatorSelection: {
        residentKey: args.residentKey ?? "preferred",
        userVerification: args.userVerification ?? "required",
        authenticatorAttachment: args.authenticatorAttachment ?? undefined,
      },
    });

    await ctx.db.insert("auth_passkey_challenges", {
      challenge: options.challenge,
      type: "registration",
      userId: args.userId,
      identifier,
      rpID: args.rpID,
      origin: args.origin === undefined ? undefined : [args.origin].flat(),
      expiresAt: now + CHALLENGE_TTL_MS,
      createdAt: now,
    });

    return options;
  },
});

export const verifyPasskeyRegistration = mutation({
  args: {
    userId: v.id("users"),
    identifier: v.optional(v.string()),
    challenge: v.string(),
    response: registrationResponseValidator,
    rpID: v.string(),
    origin: v.union(v.string(), v.array(v.string())),
    name: v.optional(v.string()),
    requireUserVerification: v.optional(v.boolean()),
    maxPasskeys: v.optional(v.number()),
  },
  returns: v.object({
    userId: v.id("users"),
    credentialId: v.string(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();

    const challengeRecord = await ctx.db
      .query("auth_passkey_challenges")
      .withIndex("by_challenge", (q) => q.eq("challenge", args.challenge))
      .first();

    if (!challengeRecord || challengeRecord.type !== "registration") {
      throw new Error("Invalid or unknown registration challenge");
    }
    if (challengeRecord.userId !== args.userId) {
      throw new Error("Challenge does not belong to this user");
    }
    if (
      args.identifier !== undefined &&
      challengeRecord.identifier !== undefined &&
      args.identifier !== challengeRecord.identifier
    ) {
      throw new Error("Challenge does not belong to this identifier");
    }
    if (challengeRecord.expiresAt < now) {
      await ctx.db.delete(challengeRecord._id);
      throw new Error("Registration challenge has expired");
    }

    const existing = await ctx.db
      .query("auth_passkeys")
      .withIndex("by_credentialId", (q) => q.eq("credentialId", args.response.id))
      .first();

    if (existing) {
      throw new Error("This passkey has already been registered");
    }

    // Re-check the cap here, not only at options time — two parallel
    // registration ceremonies must not both land past the limit.
    const maxPasskeys = args.maxPasskeys ?? MAX_PASSKEYS_PER_USER;
    const userPasskeys = await getUserPasskeys(ctx, args.userId);
    if (userPasskeys.filter((pk) => !pk.revokedAt).length >= maxPasskeys) {
      throw new Error("Maximum number of passkeys reached for this user");
    }

    const expectedRPID = challengeRecord.rpID ?? args.rpID;
    const expectedOrigin = challengeRecord.origin ?? args.origin;
    const identifier = challengeRecord.identifier ?? args.identifier ?? "";

    const verification = await verifyRegistrationResponse({
      response: args.response as RegistrationResponseJSON,
      expectedChallenge: args.challenge,
      expectedOrigin,
      expectedRPID,
      requireUserVerification: args.requireUserVerification ?? true,
    });

    if (!verification.verified) {
      throw new Error("Passkey registration could not be verified");
    }

    // Single-use: burn the challenge only once the ceremony has verified, so a
    // failed attempt can be retried but a successful one cannot be replayed.
    await ctx.db.delete(challengeRecord._id);

    const { registrationInfo } = verification;
    const { credential } = registrationInfo;

    const providerIdentityId = `passkey:${expectedRPID}:${credential.id}`;
    const identityRecordId = await ctx.db.insert("auth_identities", {
      identityId: providerIdentityId,
      userId: args.userId,
      provider: "passkey",
      issuer: expectedRPID,
      subject: credential.id,
      tokenIdentifier: credential.id,
      email: identifier,
      emailVerified: false,
      sessionId: null,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auth_passkeys", {
      userId: args.userId,
      identityId: identityRecordId,
      credentialId: credential.id,
      publicKey: bytesToBase64url(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      aaguid: registrationInfo.aaguid,
      deviceType: registrationInfo.credentialDeviceType,
      backedUp: registrationInfo.credentialBackedUp,
      name: args.name,
      createdAt: now,
      lastUsedAt: now,
    });

    await ctx.db.insert("auth_audit_events", {
      actorUserId: args.userId,
      actorType: "user",
      eventType: "passkey_registered",
      targetType: "passkey",
      targetId: credential.id,
      organizationId: undefined,
      metadataJson: undefined,
      createdAt: now,
    });

    return { userId: args.userId, credentialId: credential.id };
  },
});

export const listPasskeys = query({
  args: {
    userId: v.optional(v.id("users")),
  },
  returns: v.array(
    v.object({
      credentialId: v.string(),
      name: v.optional(v.string()),
      createdAt: v.number(),
      lastUsedAt: v.number(),
      revoked: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    if (!args.userId) {
      return [];
    }
    const userId = args.userId;
    const passkeys = await getUserPasskeys(ctx, userId);

    return passkeys.map((pk) => ({
      credentialId: pk.credentialId,
      name: pk.name,
      createdAt: pk.createdAt,
      lastUsedAt: pk.lastUsedAt,
      revoked: !!pk.revokedAt,
    }));
  },
});

export const revokePasskey = mutation({
  args: {
    credentialId: v.string(),
    userId: v.id("users"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const passkey = await ctx.db
      .query("auth_passkeys")
      .withIndex("by_credentialId", (q) => q.eq("credentialId", args.credentialId))
      .first();

    if (!passkey || passkey.revokedAt) {
      return false;
    }
    if (passkey.userId !== args.userId) {
      throw new Error("Passkey does not belong to this user");
    }

    const now = Date.now();
    await ctx.db.patch(passkey._id, { revokedAt: now });
    await revokePasskeySessions(ctx, passkey, now);
    await ctx.db.insert("auth_audit_events", {
      actorUserId: passkey.userId,
      actorType: "user",
      eventType: "passkey_revoked",
      targetType: "passkey",
      targetId: passkey.credentialId,
      organizationId: undefined,
      metadataJson: undefined,
      createdAt: now,
    });
    return true;
  },
});

export const renamePasskey = mutation({
  args: {
    credentialId: v.string(),
    userId: v.id("users"),
    name: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const passkey = await ctx.db
      .query("auth_passkeys")
      .withIndex("by_credentialId", (q) => q.eq("credentialId", args.credentialId))
      .first();

    if (!passkey || passkey.revokedAt) {
      return false;
    }
    if (passkey.userId !== args.userId) {
      throw new Error("Passkey does not belong to this user");
    }

    const name = args.name.trim();
    if (!name) {
      throw new Error("Passkey name cannot be empty");
    }
    await ctx.db.patch(passkey._id, { name });
    await ctx.db.insert("auth_audit_events", {
      actorUserId: args.userId,
      actorType: "user",
      eventType: "passkey_renamed",
      targetType: "passkey",
      targetId: passkey.credentialId,
      organizationId: undefined,
      metadataJson: undefined,
      createdAt: Date.now(),
    });
    return true;
  },
});

const authenticationResponseValidator = v.object({
  id: v.string(),
  rawId: v.string(),
  response: v.object({
    clientDataJSON: v.string(),
    authenticatorData: v.string(),
    signature: v.string(),
    userHandle: v.optional(v.string()),
  }),
  clientExtensionResults: v.optional(v.record(v.string(), v.any())),
  type: v.optional(v.string()),
  authenticatorAttachment: v.optional(v.string()),
});

export const generatePasskeyAuthenticationOptions = mutation({
  args: {
    userId: v.optional(v.id("users")),
    credentialId: v.optional(v.string()),
    rpID: v.string(),
    origin: v.optional(v.union(v.string(), v.array(v.string()))),
    userVerification: v.optional(
      v.union(v.literal("required"), v.literal("preferred"), v.literal("discouraged")),
    ),
    // Only when the caller is authenticated as `userId` may we echo that
    // user's credential ids back — otherwise an unauthenticated caller could
    // enumerate another user's passkeys. Discoverable-credential sign-in still
    // works with an empty allowCredentials.
    enumerateCredentials: v.optional(v.boolean()),
  },
  returns: v.record(v.string(), v.any()),
  handler: async (ctx, args) => {
    const now = Date.now();
    await deleteExpiredChallenges(ctx, now);
    const challengeBytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(challengeBytes);
    const challenge = bytesToBase64url(challengeBytes);

    let allowCredentials: { id: string; type: string; transports: string[] }[] = [];

    if (args.credentialId) {
      allowCredentials = [{ id: args.credentialId, type: "public-key", transports: [] }];
    } else if (args.userId && args.enumerateCredentials === true) {
      const passkeys = await getUserPasskeys(ctx, args.userId);
      allowCredentials = passkeys
        .filter((pk) => !pk.revokedAt)
        .map((pk) => ({
          id: pk.credentialId,
          type: "public-key" as const,
          transports: pk.transports ?? [],
        }));
    }

    const options = await generateAuthenticationOptions({
      rpID: args.rpID,
      challenge,
      allowCredentials,
      userVerification: args.userVerification ?? "required",
    });

    await ctx.db.insert("auth_passkey_challenges", {
      challenge: options.challenge,
      type: "authentication",
      userId: args.userId ?? undefined,
      identifier: undefined,
      rpID: args.rpID,
      origin: args.origin === undefined ? undefined : [args.origin].flat(),
      expiresAt: now + CHALLENGE_TTL_MS,
      createdAt: now,
    });

    return options;
  },
});

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TWO_FACTOR_PENDING_TTL_MS = 10 * 60 * 1000;
const TWO_FACTOR_SESSION_ID = "__two_factor";

// SimpleWebAuthn throws (rather than returning `verified: false`) when the
// authenticator presents a non-increasing signature counter. Detect that
// specific failure so the caller can treat it as cloned-credential evidence.
export function isCounterRegressionError(err: unknown): boolean {
  return err instanceof Error && /Response counter value .*lower than expected/.test(err.message);
}

const NON_COUNTER_VERIFY_ERROR =
  /signature|challenge|origin|rp.?id|user.?verification|ceremony|attestation|fmt|unsupported/i;

export function isClonedCredentialError(
  err: unknown,
  storedCounter: number,
  response: { response: { authenticatorData: string } },
): boolean {
  if (isCounterRegressionError(err)) {
    return true;
  }
  if (!(err instanceof Error) || NON_COUNTER_VERIFY_ERROR.test(err.message)) {
    return false;
  }
  const presented = signCountFromAuthData(response.response.authenticatorData);
  return presented !== null && storedCounter > 0 && presented <= storedCounter;
}

export const verifyPasskeyAuthentication = mutation({
  args: {
    challenge: v.string(),
    response: authenticationResponseValidator,
    rpID: v.string(),
    origin: v.union(v.string(), v.array(v.string())),
    requireUserVerification: v.optional(v.boolean()),
    sessionTtlMs: v.optional(v.number()),
    refreshTokenTtlMs: v.optional(v.number()),
  },
  returns: v.object({
    token: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    userId: v.id("users"),
    identityId: v.optional(v.id("auth_identities")),
    sessionId: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    twoFactorRedirect: v.optional(v.boolean()),
    twoFactorChallengeToken: v.optional(v.string()),
    twoFactorMethods: v.optional(v.array(v.string())),
    twoFactorCookieMaxAgeMs: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();

    const challengeRecord = await ctx.db
      .query("auth_passkey_challenges")
      .withIndex("by_challenge", (q) => q.eq("challenge", args.challenge))
      .first();

    if (!challengeRecord || challengeRecord.type !== "authentication") {
      throw new Error("Invalid or unknown authentication challenge");
    }
    if (challengeRecord.expiresAt < now) {
      await ctx.db.delete(challengeRecord._id);
      throw new Error("Authentication challenge has expired");
    }

    const passkey = await ctx.db
      .query("auth_passkeys")
      .withIndex("by_credentialId", (q) => q.eq("credentialId", args.response.id))
      .first();

    if (!passkey || passkey.revokedAt) {
      throw new Error("Passkey not found or has been revoked");
    }

    // The challenge was scoped to a user when options were generated — the
    // authenticating credential must belong to that same user.
    if (challengeRecord.userId && passkey.userId !== challengeRecord.userId) {
      throw new Error("Passkey does not match the user this challenge was issued for");
    }

    const expectedRPID = challengeRecord.rpID ?? args.rpID;
    const expectedOrigin = challengeRecord.origin ?? args.origin;

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: args.response as AuthenticationResponseJSON,
        expectedChallenge: args.challenge,
        expectedOrigin,
        expectedRPID,
        credential: {
          id: passkey.credentialId,
          publicKey: new Uint8Array(base64urlToBytes(passkey.publicKey)),
          counter: passkey.counter,
          transports: passkey.transports ?? [],
        },
        requireUserVerification: args.requireUserVerification ?? true,
      });
    } catch (err) {
      // SimpleWebAuthn throws on a non-increasing signature counter — a
      // cloned authenticator signal. Revoke the credential, retire the
      // sessions it minted, and fail closed.
      if (isClonedCredentialError(err, passkey.counter, args.response)) {
        await ctx.db.patch(passkey._id, { revokedAt: now });
        await revokePasskeySessions(ctx, passkey, now);
        await ctx.db.insert("auth_audit_events", {
          actorUserId: passkey.userId,
          actorType: "system",
          eventType: "passkey_counter_regression",
          targetType: "passkey",
          targetId: passkey.credentialId,
          organizationId: undefined,
          metadataJson: JSON.stringify({ storedCounter: passkey.counter }),
          createdAt: now,
        });
        throw new Error("Passkey counter regressed; the credential may have been cloned");
      }
      throw err;
    }

    if (!verification.verified) {
      throw new Error("Passkey authentication could not be verified");
    }

    // Single-use: burn the challenge only once the ceremony has verified, so a
    // failed attempt can be retried but a successful one cannot be replayed.
    await ctx.db.delete(challengeRecord._id);

    const { authenticationInfo } = verification;

    await ctx.db.patch(passkey._id, {
      counter: authenticationInfo.newCounter,
      lastUsedAt: now,
      deviceType: authenticationInfo.credentialDeviceType,
      backedUp: authenticationInfo.credentialBackedUp,
    });

    const user = await ctx.db.get("users", passkey.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // A passkey ceremony that verified the user (UV flag set) already delivers
    // possession + verification — it satisfies 2FA. When UV was relaxed at
    // config time and the user has TOTP 2FA enabled, gate the session on the
    // same pending-challenge flow password sign-in uses.
    if (user.twoFactorEnabled && !authenticationInfo.userVerified) {
      const challengeToken = await mintToken(
        user._id,
        TWO_FACTOR_SESSION_ID,
        { identityId: passkey.identityId, twoFactor: true },
        { expiresInSeconds: Math.floor(TWO_FACTOR_PENDING_TTL_MS / 1000) },
      );
      const tokenHash = await hashToken(challengeToken);
      await ctx.db.insert("authVerificationCodes", {
        userId: user._id,
        type: "two_factor_pending",
        tokenHash,
        expiresAt: now + TWO_FACTOR_PENDING_TTL_MS,
        consumedAt: undefined,
        createdAt: now,
        updatedAt: now,
      });
      return {
        token: undefined,
        refreshToken: undefined,
        userId: user._id,
        identityId: passkey.identityId,
        sessionId: undefined,
        expiresAt: undefined,
        twoFactorRedirect: true,
        twoFactorChallengeToken: challengeToken,
        twoFactorMethods: ["totp"],
        twoFactorCookieMaxAgeMs: TWO_FACTOR_PENDING_TTL_MS,
      };
    }

    const sessionTtlMs = args.sessionTtlMs ?? SESSION_TTL_MS;
    const refreshTokenTtlMs = args.refreshTokenTtlMs ?? REFRESH_TOKEN_TTL_MS;
    const sessionId = crypto.randomUUID();
    const sessionExpiresAt = now + sessionTtlMs;
    const token = await mintToken(
      user._id,
      sessionId,
      { identityId: passkey.identityId },
      { expiresInSeconds: sessionTtlMs / 1000 },
    );
    const refreshToken = generateVerificationToken();
    const refreshTokenHash = await hashToken(refreshToken);
    const refreshTokenExpiresAt = now + refreshTokenTtlMs;

    await ctx.db.insert("authRefreshTokens", {
      tokenHash: refreshTokenHash,
      sessionId,
      userId: user._id,
      familyId: sessionId,
      expiresAt: refreshTokenExpiresAt,
      revokedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("authSessions", {
      sessionId,
      userId: user._id,
      token,
      familyId: sessionId,
      expiresAt: sessionExpiresAt,
      ipAddress: undefined,
      userAgent: undefined,
      credentialId: passkey.credentialId,
      revokedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auth_audit_events", {
      actorUserId: user._id,
      actorType: "user",
      eventType: "passkey_authenticated",
      targetType: "session",
      targetId: sessionId,
      organizationId: undefined,
      metadataJson: undefined,
      createdAt: now,
    });

    return {
      token,
      refreshToken,
      userId: user._id,
      identityId: passkey.identityId,
      sessionId,
      expiresAt: sessionExpiresAt,
    };
  },
});
