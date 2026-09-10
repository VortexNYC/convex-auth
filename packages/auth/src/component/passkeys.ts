import { mutation } from "./_generated/server.js";
import { v } from "convex/values";
import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { bytesToBase64url } from "../convex-runtime/native/password.js";

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

export const listPasskeys = mutation({
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
