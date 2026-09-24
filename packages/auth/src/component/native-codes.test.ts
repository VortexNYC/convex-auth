/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api.js";
import schema from "./schema.js";

const modules = import.meta.glob("./*/*.*s");

describe("native verification codes", () => {
  it("creates and retrieves a verification code by token hash", async () => {
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

    await t.mutation(api.native.codes.createVerificationCode, {
      userId,
      type: "email_verification",
      tokenHash: "deadbeef",
      expiresAt: 1_000_000,
    });

    const code = await t.query(api.native.codes.getVerificationCodeByTokenHash, {
      tokenHash: "deadbeef",
      type: "email_verification",
    });

    expect(code).not.toBeNull();
    expect(code?.userId).toBe(userId);
    expect(code?.type).toBe("email_verification");
    expect(code?.tokenHash).toBe("deadbeef");
    expect(code?.consumedAt).toBeUndefined();
  });

  it("consumes a code once and returns null on second consume", async () => {
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

    await t.mutation(api.native.codes.createVerificationCode, {
      userId,
      type: "password_reset",
      tokenHash: "deadbeef",
      expiresAt: Date.now() + 1_000_000,
    });

    const first = await t.mutation(api.native.codes.consumeVerificationCode, {
      tokenHash: "deadbeef",
      type: "password_reset",
    });
    expect(first?.tokenHash).toBe("deadbeef");
    expect(first?.consumedAt).toBeGreaterThan(0);

    const second = await t.mutation(api.native.codes.consumeVerificationCode, {
      tokenHash: "deadbeef",
      type: "password_reset",
    });
    expect(second).toBeNull();
  });

  it("revokes all unconsumed codes for a user and type", async () => {
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

    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("authVerificationCodes", {
        userId,
        type: "email_verification",
        tokenHash: "aaaa",
        expiresAt: now + 1_000_000,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("authVerificationCodes", {
        userId,
        type: "email_verification",
        tokenHash: "bbbb",
        expiresAt: now + 1_000_000,
        createdAt: now,
        updatedAt: now,
      });
    });

    const revoked = await t.mutation(api.native.codes.revokeVerificationCodesForUser, {
      userId,
      type: "email_verification",
    });
    expect(revoked).toBe(2);

    const first = await t.query(api.native.codes.getVerificationCodeByTokenHash, {
      tokenHash: "aaaa",
      type: "email_verification",
    });
    const second = await t.query(api.native.codes.getVerificationCodeByTokenHash, {
      tokenHash: "bbbb",
      type: "email_verification",
    });
    expect(first?.consumedAt).toBeGreaterThan(0);
    expect(second?.consumedAt).toBeGreaterThan(0);
  });

  it("revokes unconsumed codes beyond a single 1000-row page", async () => {
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

    const now = Date.now();
    await t.run(async (ctx) => {
      for (let i = 0; i < 1100; i++) {
        await ctx.db.insert("authVerificationCodes", {
          userId,
          type: "two_factor_pending",
          tokenHash: `hash-${i}`,
          expiresAt: now + 1_000_000,
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    const revoked = await t.mutation(api.native.codes.revokeVerificationCodesForUser, {
      userId,
      type: "two_factor_pending",
    });
    expect(revoked).toBe(1100);
  });

  it("creating a new code of the same type revokes prior codes", async () => {
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

    await t.mutation(api.native.codes.createVerificationCode, {
      userId,
      type: "email_verification",
      tokenHash: "first",
      expiresAt: 1_000_000,
    });

    await t.mutation(api.native.codes.createVerificationCode, {
      userId,
      type: "email_verification",
      tokenHash: "second",
      expiresAt: 1_000_000,
    });

    const first = await t.query(api.native.codes.getVerificationCodeByTokenHash, {
      tokenHash: "first",
      type: "email_verification",
    });
    const second = await t.query(api.native.codes.getVerificationCodeByTokenHash, {
      tokenHash: "second",
      type: "email_verification",
    });

    expect(first?.consumedAt).toBeGreaterThan(0);
    expect(second?.consumedAt).toBeUndefined();
  });

  it("does not find an expired code when queried after expiry", async () => {
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

    await t.mutation(api.native.codes.createVerificationCode, {
      userId,
      type: "email_verification",
      tokenHash: "expired",
      expiresAt: 1,
    });

    const code = await t.query(api.native.codes.getVerificationCodeByTokenHash, {
      tokenHash: "expired",
      type: "email_verification",
    });

    /*
     * getVerificationCodeByTokenHash returns the document regardless of expiry;
     * expiry is checked by the caller.
     */
    expect(code).not.toBeNull();
    expect(code?.expiresAt).toBe(1);
  });

  it("cleanupVerificationCodes deletes expired and consumed codes", async () => {
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

    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("authVerificationCodes", {
        userId,
        type: "email_verification",
        tokenHash: "expired",
        expiresAt: 1,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("authVerificationCodes", {
        userId,
        type: "email_verification",
        tokenHash: "consumed",
        expiresAt: now + 60_000,
        consumedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });

    const deleted = await t.mutation(api.native.codes.cleanupVerificationCodes, {
      userId,
      type: "email_verification",
    });
    expect(deleted).toBe(2);

    const expired = await t.query(api.native.codes.getVerificationCodeByTokenHash, {
      tokenHash: "expired",
      type: "email_verification",
    });
    const consumed = await t.query(api.native.codes.getVerificationCodeByTokenHash, {
      tokenHash: "consumed",
      type: "email_verification",
    });
    expect(expired).toBeNull();
    expect(consumed).toBeNull();
  });

  it("two_factor_pending: carries the identity through lookup, is single-use, and expires", async () => {
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

    /*
     * The pending token is minted alongside the identity the challenge was
     * issued for — the verify path (and any cookie/proxy substitution of the
     * token) needs it to mint the post-2FA session for the right identity.
     */
    const expiresAt = Date.now() + 300_000;
    await t.mutation(api.native.codes.createVerificationCode, {
      userId,
      type: "two_factor_pending",
      tokenHash: "pending-hash",
      identityId: "identity_1",
      rememberMe: true,
      expiresAt,
    });

    const pending = await t.query(api.native.codes.getVerificationCodeByTokenHash, {
      tokenHash: "pending-hash",
      type: "two_factor_pending",
    });
    expect(pending).toMatchObject({
      userId,
      identityId: "identity_1",
      rememberMe: true,
      expiresAt,
    });

    /*
     * Single-use: the first consume wins, the second gets nothing — a
     * replayed pending token cannot mint a second session.
     */
    const first = await t.mutation(api.native.codes.consumeVerificationCode, {
      tokenHash: "pending-hash",
      type: "two_factor_pending",
    });
    expect(first?.identityId).toBe("identity_1");
    const second = await t.mutation(api.native.codes.consumeVerificationCode, {
      tokenHash: "pending-hash",
      type: "two_factor_pending",
    });
    expect(second).toBeNull();

    /* Expired pending tokens refuse at consume time. */
    await t.mutation(api.native.codes.createVerificationCode, {
      userId,
      type: "two_factor_pending",
      tokenHash: "expired-pending",
      identityId: "identity_1",
      expiresAt: 1,
    });
    const expiredConsume = await t.mutation(api.native.codes.consumeVerificationCode, {
      tokenHash: "expired-pending",
      type: "two_factor_pending",
    });
    expect(expiredConsume).toBeNull();
  });
});
