/// <reference types="vite/client" />

import { describe, expect, it, beforeAll } from "vitest";
import { generateKeyPair, exportJWK } from "jose";
import { convexTest } from "convex-test";
import { api } from "./_generated/api.js";
import schema from "./schema.js";
import { hashToken } from "../convex-runtime/native/tokens.js";

const modules = import.meta.glob("./**/*.*s");

beforeAll(async () => {
  process.env.CONVEX_SITE_URL = "https://test.convex.site";
  const pair = await generateKeyPair("RS256", { extractable: true });
  const privateJwk = await exportJWK(pair.privateKey);
  const publicJwk = await exportJWK(pair.publicKey);
  process.env.JWT_PRIVATE_KEY = JSON.stringify(privateJwk);
  process.env.JWKS = JSON.stringify({ keys: [{ use: "sig", ...publicJwk }] });
});

describe("identity verification and password reset", () => {
  it("verifyEmail consumes the code and marks email verified", async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "shlomo@example.com",
        name: "Shlomo",
        emailVerified: false,
        isActive: true,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    const identityId = await t.run(async (ctx) =>
      ctx.db.insert("auth_identities", {
        identityId: "subject_1",
        userId,
        provider: "password",
        issuer: "native",
        subject: "subject_1",
        tokenIdentifier: "subject_1",
        email: "shlomo@example.com",
        emailVerified: false,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    const tokenHash = await hashToken("verify-token");
    await t.mutation(api.native.codes.createVerificationCode, {
      userId,
      type: "email_verification",
      tokenHash,
      expiresAt: Date.now() + 60_000,
    });

    const result = await t.mutation(api.identity.verifyEmail, {
      tokenHash,
      provider: "password",
      issuer: "native",
    });

    expect(result.success).toBe(true);
    expect(result.user?.emailVerified).toBe(true);

    const code = await t.query(api.native.codes.getVerificationCodeByTokenHash, {
      tokenHash,
      type: "email_verification",
    });
    expect(code?.consumedAt).toBeDefined();

    const identity = await t.run((ctx) => ctx.db.get("auth_identities", identityId));
    expect(identity?.emailVerified).toBe(true);

    const user = await t.run((ctx) => ctx.db.get("users", userId));
    expect(user?.emailVerified).toBe(true);
  });

  it("verifyEmail returns expired for an expired or consumed code", async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "shlomo@example.com",
        name: "Shlomo",
        emailVerified: false,
        isActive: true,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    await t.run(async (ctx) =>
      ctx.db.insert("auth_identities", {
        identityId: "subject_1",
        userId,
        provider: "password",
        issuer: "native",
        subject: "subject_1",
        tokenIdentifier: "subject_1",
        email: "shlomo@example.com",
        emailVerified: false,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    const tokenHash = await hashToken("expired-token");
    await t.mutation(api.native.codes.createVerificationCode, {
      userId,
      type: "email_verification",
      tokenHash,
      expiresAt: 0,
    });

    const result = await t.mutation(api.identity.verifyEmail, {
      tokenHash,
      provider: "password",
      issuer: "native",
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe("expired");
  });

  it("resetPassword updates the credential hash and optionally revokes sessions", async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "shlomo@example.com",
        name: "Shlomo",
        emailVerified: true,
        isActive: true,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    const _identityId = await t.run(async (ctx) =>
      ctx.db.insert("auth_identities", {
        identityId: "subject_1",
        userId,
        provider: "password",
        issuer: "native",
        subject: "subject_1",
        tokenIdentifier: "subject_1",
        email: "shlomo@example.com",
        emailVerified: true,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    const accountId = await t.run(async (ctx) =>
      ctx.db.insert("authAccounts", {
        userId,
        provider: "password",
        issuer: "native",
        subject: "subject_1",
        credentialHash: "old-hash",
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    const sessionId = await t.run(async (ctx) =>
      ctx.db.insert("authSessions", {
        sessionId: "session_1",
        userId,
        token: "active-token",
        expiresAt: Date.now() + 60_000,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    const tokenHash = await hashToken("reset-token");
    await t.mutation(api.native.codes.createVerificationCode, {
      userId,
      type: "password_reset",
      tokenHash,
      expiresAt: Date.now() + 60_000,
    });

    const result = await t.mutation(api.identity.resetPassword, {
      tokenHash,
      credentialHash: "new-hash",
      provider: "password",
      issuer: "native",
      revokeSessions: true,
    });

    expect(result.status).toBe(true);

    const code = await t.query(api.native.codes.getVerificationCodeByTokenHash, {
      tokenHash,
      type: "password_reset",
    });
    expect(code?.consumedAt).toBeDefined();

    const account = await t.run((ctx) => ctx.db.get("authAccounts", accountId));
    expect(account?.credentialHash).toBe("new-hash");

    const session = await t.run((ctx) => ctx.db.get("authSessions", sessionId));
    expect(session?.revokedAt).toBeDefined();
  });

  it("resetPassword returns invalid for a missing code", async () => {
    const t = convexTest(schema, modules);

    const result = await t.mutation(api.identity.resetPassword, {
      tokenHash: await hashToken("missing"),
      credentialHash: "new-hash",
      provider: "password",
      issuer: "native",
    });

    expect(result.status).toBe(false);
    expect(result.reason).toBe("invalid");
  });
});

describe("provisionFromIdentity", () => {
  it("stores the identity doc id on the initial session row", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const result = await t.mutation(api.identity.provisionFromIdentity, {
      identity: {
        identityId: "subject_signup",
        provider: "password",
        issuer: "native",
        subject: "subject_signup",
        tokenIdentifier: "subject_signup",
        email: "shlomo@example.com",
        emailVerified: false,
      },
      user: { email: "shlomo@example.com", name: "Shlomo", emailVerified: false },
      account: { credentialHash: "hash" },
      initialSession: {
        sessionId: "session-signup",
        sessionExpiresAt: now + 1_000_000,
        refreshTokenHash: "rt-hash",
        refreshTokenExpiresAt: now + 1_000_000,
      },
    });
    expect(result.identityId).toBeDefined();

    /*
     * The sign-up/first-sign-in mint carries the column — this is the
     * highest-volume session path, so it must not rely on the claim fallback.
     */
    const session = await t.run((ctx) =>
      ctx.db
        .query("authSessions")
        .withIndex("by_session_id", (q) => q.eq("sessionId", "session-signup"))
        .unique(),
    );
    expect(session?.identityId).toBe(result.identityId);
  });

  it("refuses to link into an existing user by email when the identity email is unverified", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "victim@example.com",
        name: "Victim",
        emailVerified: true,
        isActive: true,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    const result = await t.mutation(api.identity.provisionFromIdentity, {
      identity: {
        identityId: "evil-issuer:attacker",
        provider: "evil",
        issuer: "evil-issuer",
        subject: "attacker",
        tokenIdentifier: "evil-issuer:attacker",
        email: "victim@example.com",
        emailVerified: false,
      },
      user: { email: "victim@example.com", name: "Attacker", emailVerified: false },
    });

    expect(result.duplicate).toBe(true);
    expect(result.createdUser).toBe(false);

    const identity = await t.run((ctx) =>
      ctx.db
        .query("auth_identities")
        .withIndex("by_identity_id", (q) => q.eq("identityId", "evil-issuer:attacker"))
        .unique(),
    );
    expect(identity).toBeNull();
  });

  it("links an unverified-email identity only when allowUnverifiedEmailLink is set", async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "user@example.com",
        name: "User",
        emailVerified: true,
        isActive: true,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    const result = await t.mutation(api.identity.provisionFromIdentity, {
      identity: {
        identityId: "trusted:sub1",
        provider: "trusted",
        issuer: "trusted",
        subject: "sub1",
        tokenIdentifier: "trusted:sub1",
        email: "user@example.com",
        emailVerified: false,
      },
      user: { email: "user@example.com", name: "User", emailVerified: false },
      allowUnverifiedEmailLink: true,
    });

    expect(result.duplicate).toBeUndefined();
    expect(result.userId).toBe(userId);

    const user = await t.run((ctx) => ctx.db.get("users", userId));
    expect(user?.emailVerified).toBe(true);
  });

  it("does not downgrade a verified user's emailVerified on provision", async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "user@example.com",
        name: "User",
        emailVerified: true,
        isActive: true,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    await t.run(async (ctx) =>
      ctx.db.insert("auth_identities", {
        identityId: "github:123",
        userId,
        provider: "github",
        issuer: "github",
        subject: "123",
        tokenIdentifier: "github:123",
        email: "user@example.com",
        emailVerified: true,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    await t.mutation(api.identity.provisionFromIdentity, {
      identity: {
        identityId: "github:123",
        provider: "github",
        issuer: "github",
        subject: "123",
        tokenIdentifier: "github:123",
        email: "user@example.com",
        emailVerified: false,
      },
      user: { email: "user@example.com", name: "User", emailVerified: false },
    });

    const user = await t.run((ctx) => ctx.db.get("users", userId));
    expect(user?.emailVerified).toBe(true);
  });

  it("stores a normalized username and displayUsername on provision", async () => {
    const t = convexTest(schema, modules);

    const result = await t.mutation(api.identity.provisionFromIdentity, {
      identity: {
        identityId: "username_sub_1",
        provider: "username",
        issuer: "native",
        subject: "username_sub_1",
        tokenIdentifier: "username_sub_1",
        emailVerified: false,
      },
      user: {
        username: "  Alice ",
        displayUsername: "Alice",
        emailVerified: false,
      },
      account: { credentialHash: "hash" },
    });

    expect(result.createdUser).toBe(true);
    const user = await t.run((ctx) => ctx.db.get("users", result.userId));
    expect(user?.username).toBe("alice");
    expect(user?.displayUsername).toBe("Alice");
  });

  it("rejects a username collision inside the serialized mutation", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.identity.provisionFromIdentity, {
      identity: {
        identityId: "username_sub_1",
        provider: "username",
        issuer: "native",
        subject: "username_sub_1",
        tokenIdentifier: "username_sub_1",
        emailVerified: false,
      },
      user: { username: "alice", emailVerified: false },
      account: { credentialHash: "hash" },
    });

    const result = await t.mutation(api.identity.provisionFromIdentity, {
      identity: {
        identityId: "username_sub_2",
        provider: "username",
        issuer: "native",
        subject: "username_sub_2",
        tokenIdentifier: "username_sub_2",
        emailVerified: false,
      },
      user: { username: " ALICE ", emailVerified: false },
      account: { credentialHash: "hash2" },
    });

    expect(result.duplicate).toBe(true);
    expect(result.duplicateField).toBe("username");
    expect(result.identityId).toBeUndefined();

    const leakedIdentity = await t.run((ctx) =>
      ctx.db
        .query("auth_identities")
        .withIndex("by_identity_id", (q) => q.eq("identityId", "username_sub_2"))
        .unique(),
    );
    expect(leakedIdentity).toBeNull();
  });

  it("re-provisioning the resolved user with their own username is not a collision", async () => {
    const t = convexTest(schema, modules);

    const first = await t.mutation(api.identity.provisionFromIdentity, {
      identity: {
        identityId: "username_sub_1",
        provider: "username",
        issuer: "native",
        subject: "username_sub_1",
        tokenIdentifier: "username_sub_1",
        emailVerified: false,
      },
      user: { username: "alice", displayUsername: "Alice", emailVerified: false },
      account: { credentialHash: "hash" },
    });

    const second = await t.mutation(api.identity.provisionFromIdentity, {
      identity: {
        identityId: "username_sub_1",
        provider: "username",
        issuer: "native",
        subject: "username_sub_1",
        tokenIdentifier: "username_sub_1",
        emailVerified: false,
      },
      user: { username: "alice", emailVerified: false },
    });

    expect(second.duplicate).toBeUndefined();
    expect(second.userId).toBe(first.userId);
  });

  it("an OAuth re-provision without a username preserves the stored username", async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "alice@example.com",
        username: "alice",
        displayUsername: "Alice",
        emailVerified: true,
        isActive: true,
        createdAt: 0,
        updatedAt: 0,
      }),
    );
    await t.run(async (ctx) =>
      ctx.db.insert("auth_identities", {
        identityId: "github:alice",
        userId,
        provider: "github",
        issuer: "github",
        subject: "alice",
        tokenIdentifier: "github:alice",
        email: "alice@example.com",
        emailVerified: true,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    await t.mutation(api.identity.provisionFromIdentity, {
      identity: {
        identityId: "github:alice",
        provider: "github",
        issuer: "github",
        subject: "alice",
        tokenIdentifier: "github:alice",
        email: "alice@example.com",
        emailVerified: true,
      },
      user: { email: "alice@example.com", name: "Alice G", emailVerified: true },
    });

    const user = await t.run((ctx) => ctx.db.get("users", userId));
    expect(user?.username).toBe("alice");
    expect(user?.displayUsername).toBe("Alice");
  });
});

describe("getUserAndAccountByUsername", () => {
  it("returns user, identity, and account for a normalized lookup", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.identity.provisionFromIdentity, {
      identity: {
        identityId: "username_sub_1",
        provider: "username",
        issuer: "native",
        subject: "username_sub_1",
        tokenIdentifier: "username_sub_1",
        emailVerified: false,
      },
      user: { username: "Alice", displayUsername: "Alice", emailVerified: false },
      account: { credentialHash: "hash" },
    });

    const result = await t.query(api.identity.getUserAndAccountByUsername, {
      username: "  ALICE ",
    });

    expect(result).not.toBeNull();
    expect(result?.user.username).toBe("alice");
    expect(result?.user.displayUsername).toBe("Alice");
    expect(result?.identity.provider).toBe("username");
    expect(result?.account.credentialHash).toBe("hash");
  });

  it("returns null for unknown and blank usernames", async () => {
    const t = convexTest(schema, modules);

    expect(
      await t.query(api.identity.getUserAndAccountByUsername, { username: "ghost" }),
    ).toBeNull();
    expect(await t.query(api.identity.getUserAndAccountByUsername, { username: "   " })).toBeNull();
  });
});

describe("phone number provisioning", () => {
  it("stores a normalized phoneNumber as verified on provision", async () => {
    const t = convexTest(schema, modules);

    const result = await t.mutation(api.identity.provisionFromIdentity, {
      identity: {
        identityId: "phone-otp:native:+15551234567",
        provider: "phoneOtp",
        issuer: "native",
        subject: "+15551234567",
        tokenIdentifier: "+15551234567",
        emailVerified: false,
      },
      user: {
        phoneNumber: "+1 (555) 123-4567",
        phoneNumberVerified: true,
        emailVerified: false,
      },
    });

    expect(result.createdUser).toBe(true);
    const user = await t.run((ctx) => ctx.db.get("users", result.userId));
    expect(user?.phoneNumber).toBe("+15551234567");
    expect(user?.phoneNumberVerified).toBe(true);
  });

  it("rejects a phoneNumber collision inside the serialized mutation", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.identity.provisionFromIdentity, {
      identity: {
        identityId: "phone-otp:native:+15551234567",
        provider: "phoneOtp",
        issuer: "native",
        subject: "+15551234567",
        tokenIdentifier: "+15551234567",
        emailVerified: false,
      },
      user: { phoneNumber: "+15551234567", phoneNumberVerified: true, emailVerified: false },
    });

    const result = await t.mutation(api.identity.provisionFromIdentity, {
      identity: {
        identityId: "phone-otp:native:+15559999999",
        provider: "phoneOtp",
        issuer: "native",
        subject: "+15559999999",
        tokenIdentifier: "+15559999999",
        emailVerified: false,
      },
      user: { phoneNumber: "+1 555 123 4567", phoneNumberVerified: true, emailVerified: false },
    });

    expect(result.duplicate).toBe(true);
    expect(result.duplicateField).toBe("phoneNumber");
    expect(result.identityId).toBeUndefined();

    const leakedIdentity = await t.run((ctx) =>
      ctx.db
        .query("auth_identities")
        .withIndex("by_identity_id", (q) => q.eq("identityId", "phone-otp:native:+15559999999"))
        .unique(),
    );
    expect(leakedIdentity).toBeNull();
  });

  it("verifyPhone consumes the code and marks the phone verified", async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        phoneNumber: "+15551234567",
        phoneNumberVerified: false,
        emailVerified: false,
        isActive: true,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    const tokenHash = "phone_token_hash_1";
    await t.run(async (ctx) =>
      ctx.db.insert("authVerificationCodes", {
        userId,
        type: "phone_verification",
        tokenHash,
        expiresAt: Date.now() + 60_000,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    const result = await t.mutation(api.identity.verifyPhone, {
      tokenHash,
      phone: "+1 555-123-4567",
    });
    expect(result.success).toBe(true);

    const user = await t.run((ctx) => ctx.db.get("users", userId));
    expect(user?.phoneNumberVerified).toBe(true);

    /* Verification links a phoneOtp identity so OTP sign-in resolves this
     * user instead of failing closed on the phoneNumber collision check. */
    const identity = await t.run((ctx) =>
      ctx.db
        .query("auth_identities")
        .withIndex("by_identity_id", (q) => q.eq("identityId", "phone-otp:native:+15551234567"))
        .unique(),
    );
    expect(identity?.userId).toBe(userId);
    expect(identity?.provider).toBe("phoneOtp");

    const again = await t.mutation(api.identity.verifyPhone, {
      tokenHash,
      phone: "+15551234567",
    });
    expect(again).toMatchObject({ success: false, reason: "expired" });
  });

  it("verifyPhone rejects when the stored number changed after send (TOCTOU)", async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        phoneNumber: "+15559999999",
        phoneNumberVerified: false,
        emailVerified: false,
        isActive: true,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    const tokenHash = "phone_token_hash_2";
    await t.run(async (ctx) =>
      ctx.db.insert("authVerificationCodes", {
        userId,
        type: "phone_verification",
        tokenHash,
        expiresAt: Date.now() + 60_000,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    const result = await t.mutation(api.identity.verifyPhone, {
      tokenHash,
      phone: "+15551234567",
    });
    expect(result).toMatchObject({ success: false, reason: "phone_mismatch" });

    const user = await t.run((ctx) => ctx.db.get("users", userId));
    expect(user?.phoneNumberVerified).toBe(false);
    const code = await t.run((ctx) =>
      ctx.db
        .query("authVerificationCodes")
        .withIndex("by_user_type", (q) => q.eq("userId", userId).eq("type", "phone_verification"))
        .unique(),
    );
    expect(code?.consumedAt).toBeUndefined();
  });

  it("verifyPhone fails closed when the phoneOtp identity belongs to another user", async () => {
    const t = convexTest(schema, modules);

    const otherUserId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "other@example.com",
        emailVerified: true,
        isActive: true,
        createdAt: 0,
        updatedAt: 0,
      }),
    );
    await t.run(async (ctx) =>
      ctx.db.insert("auth_identities", {
        identityId: "phone-otp:native:+15551234567",
        userId: otherUserId,
        provider: "phoneOtp",
        issuer: "native",
        subject: "+15551234567",
        tokenIdentifier: "+15551234567",
        emailVerified: true,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        phoneNumber: "+15551234567",
        phoneNumberVerified: false,
        emailVerified: false,
        isActive: true,
        createdAt: 0,
        updatedAt: 0,
      }),
    );
    const tokenHash = "phone_token_hash_3";
    await t.run(async (ctx) =>
      ctx.db.insert("authVerificationCodes", {
        userId,
        type: "phone_verification",
        tokenHash,
        expiresAt: Date.now() + 60_000,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    const result = await t.mutation(api.identity.verifyPhone, {
      tokenHash,
      phone: "+15551234567",
    });
    expect(result).toMatchObject({ success: false, reason: "conflict" });
    const user = await t.run((ctx) => ctx.db.get("users", userId));
    expect(user?.phoneNumberVerified).toBe(false);
  });

  it("repeat phone OTP sign-in mints a session on the existing-identity path", async () => {
    const t = convexTest(schema, modules);

    const first = await t.mutation(api.identity.provisionFromIdentity, {
      identity: {
        identityId: "phone-otp:native:+15551234567",
        provider: "phoneOtp",
        issuer: "native",
        subject: "+15551234567",
        tokenIdentifier: "+15551234567",
        emailVerified: false,
      },
      user: { phoneNumber: "+15551234567", phoneNumberVerified: true, emailVerified: false },
      initialSession: {
        sessionId: "sess-1",
        sessionExpiresAt: Date.now() + 60_000,
        refreshTokenHash: "rh-1",
        refreshTokenExpiresAt: Date.now() + 600_000,
      },
    });
    expect(first.token).toBeDefined();

    const second = await t.mutation(api.identity.provisionFromIdentity, {
      identity: {
        identityId: "phone-otp:native:+15551234567",
        provider: "phoneOtp",
        issuer: "native",
        subject: "+15551234567",
        tokenIdentifier: "+15551234567",
        emailVerified: false,
      },
      user: { phoneNumber: "+15551234567", phoneNumberVerified: true, emailVerified: false },
      initialSession: {
        sessionId: "sess-2",
        sessionExpiresAt: Date.now() + 60_000,
        refreshTokenHash: "rh-2",
        refreshTokenExpiresAt: Date.now() + 600_000,
      },
    });

    expect(second.linkedExistingIdentity).toBe(true);
    expect(second.token).toBeDefined();
    expect(second.sessionId).toBe("sess-2");

    const session = await t.run((ctx) =>
      ctx.db
        .query("authSessions")
        .withIndex("by_session_id", (q) => q.eq("sessionId", "sess-2"))
        .unique(),
    );
    expect(session?.userId).toBe(first.userId);
    const refresh = await t.run((ctx) =>
      ctx.db
        .query("authRefreshTokens")
        .withIndex("by_token_hash", (q) => q.eq("tokenHash", "rh-2"))
        .unique(),
    );
    expect(refresh?.sessionId).toBe("sess-2");
  });

  it("getUserByPhoneNumber normalizes before lookup", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.identity.provisionFromIdentity, {
      identity: {
        identityId: "phone-otp:native:+15551234567",
        provider: "phoneOtp",
        issuer: "native",
        subject: "+15551234567",
        tokenIdentifier: "+15551234567",
        emailVerified: false,
      },
      user: { phoneNumber: "+15551234567", phoneNumberVerified: true, emailVerified: false },
    });

    const found = await t.query(api.native.users.getUserByPhoneNumber, {
      phoneNumber: "+1 555-123-4567",
    });
    expect(found?.phoneNumber).toBe("+15551234567");
    expect(
      await t.query(api.native.users.getUserByPhoneNumber, { phoneNumber: "nope" }),
    ).toBeNull();
  });
});
