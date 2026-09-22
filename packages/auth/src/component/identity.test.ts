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

    const identity = await t.run((ctx) => ctx.db.get("auth_identities", identityId as any));
    expect(identity?.emailVerified).toBe(true);

    const user = await t.run((ctx) => ctx.db.get("users", userId as any));
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

    const account = await t.run((ctx) => ctx.db.get("authAccounts", accountId as any));
    expect(account?.credentialHash).toBe("new-hash");

    const session = await t.run((ctx) => ctx.db.get("authSessions", sessionId as any));
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

    // The sign-up/first-sign-in mint carries the column — this is the
    // highest-volume session path, so it must not rely on the claim fallback.
    const session = await t.run((ctx) =>
      ctx.db
        .query("authSessions")
        .withIndex("by_session_id", (q) => q.eq("sessionId", "session-signup"))
        .unique(),
    );
    expect(session?.identityId).toBe(result.identityId);
  });
});
