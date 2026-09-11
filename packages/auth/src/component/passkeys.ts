import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";
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

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

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
    userVerification: v.optional(
      v.union(v.literal("required"), v.literal("preferred"), v.literal("discouraged")),
    ),
    authenticatorAttachment: v.optional(
      v.union(v.literal("platform"), v.literal("cross-platform")),
    ),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const challengeBytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(challengeBytes);
    const challenge = bytesToBase64url(challengeBytes);

    const existing = await ctx.db
      .query("auth_passkeys")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .take(100);

    const excludeCredentials = existing
      .filter((pk) => !pk.revokedAt)
      .map((pk) => ({
        id: pk.credentialId,
        transports: pk.transports ?? [],
      }));

    const options = await generateRegistrationOptions({
      rpName: args.rpName,
      rpID: args.rpID,
      userName: args.identifier,
      userDisplayName: args.displayName ?? args.identifier,
      challenge,
      attestationType: "none",
      excludeCredentials,
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: args.userVerification ?? "preferred",
        authenticatorAttachment: args.authenticatorAttachment ?? undefined,
      },
    });

    await ctx.db.insert("auth_passkey_challenges", {
      challenge: options.challenge,
      type: "registration",
      userId: args.userId,
      identifier: args.identifier,
      expiresAt: now + CHALLENGE_TTL_MS,
      createdAt: now,
    });

    return options;
  },
});

export const verifyPasskeyRegistration = mutation({
  args: {
    userId: v.id("users"),
    identifier: v.string(),
    challenge: v.string(),
    response: registrationResponseValidator,
    rpID: v.string(),
    origin: v.string(),
    name: v.optional(v.string()),
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
    if (challengeRecord.expiresAt < now) {
      await ctx.db.delete(challengeRecord._id);
      throw new Error("Registration challenge has expired");
    }
    await ctx.db.delete(challengeRecord._id);

    const existing = await ctx.db
      .query("auth_passkeys")
      .withIndex("by_credentialId", (q) => q.eq("credentialId", args.response.id))
      .first();

    if (existing) {
      throw new Error("This passkey has already been registered");
    }

    const verification = await verifyRegistrationResponse({
      response: args.response as RegistrationResponseJSON,
      expectedChallenge: args.challenge,
      expectedOrigin: args.origin,
      expectedRPID: args.rpID,
      requireUserVerification: true,
    });

    if (!verification.verified) {
      throw new Error("Passkey registration could not be verified");
    }

    const { registrationInfo } = verification;
    const { credential } = registrationInfo;

    const providerIdentityId = `passkey:${args.rpID}:${credential.id}`;
    const identityRecordId = await ctx.db.insert("auth_identities", {
      identityId: providerIdentityId,
      userId: args.userId,
      provider: "passkey",
      issuer: args.rpID,
      subject: credential.id,
      tokenIdentifier: credential.id,
      email: args.identifier,
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

    return { userId: args.userId, credentialId: credential.id };
  },
});

export const listPasskeys = query({
  args: {
    userId: v.id("users"),
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
    const passkeys = await ctx.db
      .query("auth_passkeys")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .take(100);

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

    await ctx.db.patch(passkey._id, { revokedAt: Date.now() });
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
    userVerification: v.optional(
      v.union(v.literal("required"), v.literal("preferred"), v.literal("discouraged")),
    ),
  },
  returns: v.record(v.string(), v.any()),
  handler: async (ctx, args) => {
    const now = Date.now();
    const challengeBytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(challengeBytes);
    const challenge = bytesToBase64url(challengeBytes);

    let allowCredentials: { id: string; type: string; transports: string[] }[] = [];

    if (args.credentialId) {
      const passkey = await ctx.db
        .query("auth_passkeys")
        .withIndex("by_credentialId", (q) => q.eq("credentialId", args.credentialId!))
        .first();
      if (passkey && !passkey.revokedAt) {
        allowCredentials = [
          {
            id: passkey.credentialId,
            type: "public-key",
            transports: passkey.transports ?? [],
          },
        ];
      }
    } else if (args.userId) {
      const passkeys = await ctx.db
        .query("auth_passkeys")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId!))
        .take(100);
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
      userVerification: args.userVerification ?? "preferred",
    });

    await ctx.db.insert("auth_passkey_challenges", {
      challenge: options.challenge,
      type: "authentication",
      userId: args.userId ?? undefined,
      identifier: undefined,
      expiresAt: now + CHALLENGE_TTL_MS,
      createdAt: now,
    });

    return options;
  },
});

const SESSION_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const verifyPasskeyAuthentication = mutation({
  args: {
    challenge: v.string(),
    response: authenticationResponseValidator,
    rpID: v.string(),
    origin: v.string(),
  },
  returns: v.object({
    token: v.string(),
    refreshToken: v.string(),
    userId: v.id("users"),
    identityId: v.optional(v.id("auth_identities")),
    sessionId: v.string(),
    expiresAt: v.number(),
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
    await ctx.db.delete(challengeRecord._id);

    const passkey = await ctx.db
      .query("auth_passkeys")
      .withIndex("by_credentialId", (q) => q.eq("credentialId", args.response.id))
      .first();

    if (!passkey || passkey.revokedAt) {
      throw new Error("Passkey not found or has been revoked");
    }

    const verification = await verifyAuthenticationResponse({
      response: args.response as AuthenticationResponseJSON,
      expectedChallenge: args.challenge,
      expectedOrigin: args.origin,
      expectedRPID: args.rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(base64urlToBytes(passkey.publicKey)),
        counter: passkey.counter,
        transports: passkey.transports ?? [],
      },
      requireUserVerification: true,
    });

    if (!verification.verified) {
      throw new Error("Passkey authentication could not be verified");
    }

    const { authenticationInfo } = verification;

    await ctx.db.patch(passkey._id, {
      counter: authenticationInfo.newCounter,
      lastUsedAt: now,
      deviceType: authenticationInfo.credentialDeviceType,
      backedUp: authenticationInfo.credentialBackedUp,
    });

    const user = await ctx.db.get(passkey.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const sessionId = crypto.randomUUID();
    const sessionExpiresAt = now + SESSION_TTL_MS;
    const token = await mintToken(
      user._id,
      sessionId,
      { identityId: passkey.identityId },
      { expiresInSeconds: SESSION_TTL_MS / 1000 },
    );
    const refreshToken = generateVerificationToken();
    const refreshTokenHash = await hashToken(refreshToken);
    const refreshTokenExpiresAt = now + REFRESH_TOKEN_TTL_MS;

    await ctx.db.insert("authRefreshTokens", {
      tokenHash: refreshTokenHash,
      sessionId,
      userId: user._id,
      expiresAt: refreshTokenExpiresAt,
      revokedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("authSessions", {
      sessionId,
      userId: user._id,
      token,
      expiresAt: sessionExpiresAt,
      ipAddress: undefined,
      userAgent: undefined,
      revokedAt: undefined,
      createdAt: now,
      updatedAt: now,
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
