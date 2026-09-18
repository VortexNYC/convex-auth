/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api.js";
import schema from "./schema.js";

const modules = import.meta.glob("./**/*.*s");

async function insertUser(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "shlomo@example.com",
      name: "Shlomo",
      emailVerified: false,
      isActive: true,
      createdAt: 0,
      updatedAt: 0,
    }),
  );
}

async function insertIdentity(
  t: ReturnType<typeof convexTest>,
  userId: string,
  overrides: Record<string, unknown> = {},
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("auth_identities", {
      identityId: "subject_1",
      userId,
      provider: "password",
      issuer: "native",
      subject: "subject_1",
      tokenIdentifier: "subject_1",
      email: "shlomo@example.com",
      emailVerified: false,
      sessionId: null,
      createdAt: 0,
      updatedAt: 0,
      ...overrides,
    }),
  );
}

describe("native sessions", () => {
  it("creates and lists sessions for a user", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);

    await t.mutation(api.native.sessions.createSession, {
      sessionId: "session-1",
      userId,
      token: "token-1",
      expiresAt: Date.now() + 1_000_000,
    });

    const sessions = await t.query(api.native.sessions.listSessionsByUser, { userId });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe("session-1");
    expect(sessions[0].revokedAt).toBeUndefined();
  });

  it("revokes a session by session id", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);

    await t.mutation(api.native.sessions.createSession, {
      sessionId: "session-1",
      userId,
      token: "token-1",
      expiresAt: Date.now() + 1_000_000,
    });

    const id = await t.mutation(api.native.sessions.revokeSession, { sessionId: "session-1" });
    expect(id).not.toBeNull();

    const sessions = await t.query(api.native.sessions.listSessionsByUser, { userId });
    expect(sessions[0].revokedAt).toBeGreaterThan(0);
  });

  it("revokes active sessions for a user and skips the excluded session", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);

    await t.mutation(api.native.sessions.createSession, {
      sessionId: "session-1",
      userId,
      token: "token-1",
      expiresAt: Date.now() + 1_000_000,
    });
    await t.mutation(api.native.sessions.createSession, {
      sessionId: "session-2",
      userId,
      token: "token-2",
      expiresAt: Date.now() + 1_000_000,
    });
    await t.mutation(api.native.sessions.createSession, {
      sessionId: "session-3",
      userId,
      token: "token-3",
      expiresAt: Date.now() + 1_000_000,
    });

    const revoked = await t.mutation(api.native.sessions.revokeSessionsForUser, {
      userId,
      excludeSessionId: "session-3",
    });
    expect(revoked).toBe(2);

    const sessions = await t.query(api.native.sessions.listSessionsByUser, { userId });
    const bySessionId = Object.fromEntries(sessions.map((s) => [s.sessionId, s]));
    expect(bySessionId["session-1"].revokedAt).toBeGreaterThan(0);
    expect(bySessionId["session-2"].revokedAt).toBeGreaterThan(0);
    expect(bySessionId["session-3"].revokedAt).toBeUndefined();
  });

  it("revokes sessions beyond a single 1000-row page", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    const now = Date.now();

    await t.run(async (ctx) => {
      for (let i = 0; i < 1100; i++) {
        await ctx.db.insert("authSessions", {
          sessionId: `session-${i}`,
          userId,
          token: `token-${i}`,
          expiresAt: now + 1_000_000,
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    const revoked = await t.mutation(api.native.sessions.revokeSessionsForUser, { userId });
    expect(revoked).toBe(1100);
  });

  it("does not revoke expired sessions", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);

    await t.mutation(api.native.sessions.createSession, {
      sessionId: "session-1",
      userId,
      token: "token-1",
      expiresAt: 1,
    });

    const revoked = await t.mutation(api.native.sessions.revokeSessionsForUser, { userId });
    expect(revoked).toBe(0);

    const sessions = await t.query(api.native.sessions.listSessionsByUser, { userId });
    expect(sessions[0].revokedAt).toBeUndefined();
  });

  it("rotateSession consumes the old refresh token and session and creates a new pair", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    await insertIdentity(t, userId);
    const now = Date.now();

    await t.mutation(api.native.sessions.createSession, {
      sessionId: "session-1",
      userId,
      token: "token-1",
      expiresAt: now + 1_000_000,
    });

    await t.mutation(api.native.refreshTokens.createRefreshToken, {
      tokenHash: "old-hash",
      sessionId: "session-1",
      userId,
      expiresAt: now + 1_000_000,
    });

    const result = await t.mutation(api.native.sessions.rotateSession, {
      oldRefreshTokenHash: "old-hash",
      newSessionId: "session-2",
      newSessionToken: "token-2",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "new-hash",
      newRefreshTokenExpiresAt: now + 1_000_000,
      provider: "password",
      issuer: "native",
    });

    expect(result).toMatchObject({
      user: {
        _id: userId,
        email: "shlomo@example.com",
      },
      identityId: expect.any(String),
    });

    const [oldSession, newSession, oldRefresh, newRefresh] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db
          .query("authSessions")
          .withIndex("by_session_id", (q) => q.eq("sessionId", "session-1"))
          .unique(),
        ctx.db
          .query("authSessions")
          .withIndex("by_session_id", (q) => q.eq("sessionId", "session-2"))
          .unique(),
        ctx.db
          .query("authRefreshTokens")
          .withIndex("by_token_hash", (q) => q.eq("tokenHash", "old-hash"))
          .unique(),
        ctx.db
          .query("authRefreshTokens")
          .withIndex("by_token_hash", (q) => q.eq("tokenHash", "new-hash"))
          .unique(),
      ]),
    );

    expect(oldSession?.revokedAt).toBeDefined();
    expect(newSession?.sessionId).toBe("session-2");
    expect(newSession?.token).toBe("token-2");
    expect(oldRefresh?.revokedAt).toBeDefined();
    expect(newRefresh?.sessionId).toBe("session-2");
    expect(newRefresh?.userId).toBe(userId);
  });

  it("rotateSession propagates familyId to the rotated-in session and token", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    await insertIdentity(t, userId);
    const now = Date.now();

    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "session-1",
      userId,
      token: "token-1",
      sessionExpiresAt: now + 1_000_000,
      refreshTokenHash: "old-hash",
      refreshTokenExpiresAt: now + 1_000_000,
    });

    await t.mutation(api.native.sessions.rotateSession, {
      oldRefreshTokenHash: "old-hash",
      newSessionId: "session-2",
      newSessionToken: "token-2",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "new-hash",
      newRefreshTokenExpiresAt: now + 1_000_000,
      provider: "password",
      issuer: "native",
    });

    const [newSession, newRefresh] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db
          .query("authSessions")
          .withIndex("by_session_id", (q) => q.eq("sessionId", "session-2"))
          .unique(),
        ctx.db
          .query("authRefreshTokens")
          .withIndex("by_token_hash", (q) => q.eq("tokenHash", "new-hash"))
          .unique(),
      ]),
    );

    expect(newSession?.familyId).toBe("session-1");
    expect(newRefresh?.familyId).toBe("session-1");
  });

  it("rotateSession carries credentialId onto the rotated-in session", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    await insertIdentity(t, userId);
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("authSessions", {
        sessionId: "session-1",
        userId,
        token: "token-1",
        familyId: "fam-1",
        expiresAt: now + 1_000_000,
        credentialId: "cred-1",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("authRefreshTokens", {
        tokenHash: "old-hash",
        sessionId: "session-1",
        userId,
        familyId: "fam-1",
        expiresAt: now + 1_000_000,
        createdAt: now,
        updatedAt: now,
      });
    });

    await t.mutation(api.native.sessions.rotateSession, {
      oldRefreshTokenHash: "old-hash",
      newSessionId: "session-2",
      newSessionToken: "token-2",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "new-hash",
      newRefreshTokenExpiresAt: now + 1_000_000,
      provider: "password",
      issuer: "native",
    });

    const newSession = await t.run(async (ctx) =>
      ctx.db
        .query("authSessions")
        .withIndex("by_session_id", (q) => q.eq("sessionId", "session-2"))
        .unique(),
    );
    expect(newSession?.credentialId).toBe("cred-1");
    expect(newSession?.familyId).toBe("fam-1");
  });

  it("replaying a rotated-out refresh token outside the grace window revokes the whole session family", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    await insertIdentity(t, userId);
    const now = Date.now();

    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "session-1",
      userId,
      token: "token-1",
      sessionExpiresAt: now + 1_000_000,
      refreshTokenHash: "hash-1",
      refreshTokenExpiresAt: now + 1_000_000,
    });

    await t.mutation(api.native.sessions.rotateSession, {
      oldRefreshTokenHash: "hash-1",
      newSessionId: "session-2",
      newSessionToken: "token-2",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-2",
      newRefreshTokenExpiresAt: now + 1_000_000,
      provider: "password",
      issuer: "native",
    });

    // Attacker replays the spent token after the rotation grace window has
    // closed — inside the window it would converge instead (see tests below).
    await t.run(async (ctx) => {
      const spent = await ctx.db
        .query("authRefreshTokens")
        .withIndex("by_token_hash", (q) => q.eq("tokenHash", "hash-1"))
        .unique();
      await ctx.db.patch(spent!._id, { rotatedAt: now - 60_000 });
    });

    const replay = await t.mutation(api.native.sessions.rotateSession, {
      oldRefreshTokenHash: "hash-1",
      newSessionId: "session-3",
      newSessionToken: "token-3",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-3",
      newRefreshTokenExpiresAt: now + 1_000_000,
      provider: "password",
      issuer: "native",
    });
    expect(replay).toBeNull();

    const [liveSession, liveRefresh, noSession3] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db
          .query("authSessions")
          .withIndex("by_session_id", (q) => q.eq("sessionId", "session-2"))
          .unique(),
        ctx.db
          .query("authRefreshTokens")
          .withIndex("by_token_hash", (q) => q.eq("tokenHash", "hash-2"))
          .unique(),
        ctx.db
          .query("authSessions")
          .withIndex("by_session_id", (q) => q.eq("sessionId", "session-3"))
          .unique(),
      ]),
    );

    // The legitimate rotated-in session and token are dead too.
    expect(liveSession?.revokedAt).toBeDefined();
    expect(liveRefresh?.revokedAt).toBeDefined();
    expect(noSession3).toBeNull();

    const auditEvents = await t.run(async (ctx) => ctx.db.query("auth_audit_events").take(10));
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      actorType: "system",
      eventType: "refresh_token_reuse",
      targetType: "session",
      targetId: "session-1",
      actorUserId: userId,
    });
  });

  it("family replay revocation reaches live rows beyond a 1000-row page", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    await insertIdentity(t, userId);
    const now = Date.now();

    // Oldest rows first: a family that has rotated past one page leaves the
    // live session and refresh token beyond the first 1,000 index rows.
    await t.run(async (ctx) => {
      for (let i = 0; i < 1100; i++) {
        await ctx.db.insert("authRefreshTokens", {
          tokenHash: `spent-${i}`,
          sessionId: `spent-session-${i}`,
          userId,
          familyId: "fam-1",
          expiresAt: now + 1_000_000,
          revokedAt: now - 1,
          createdAt: now,
          updatedAt: now,
        });
      }
      await ctx.db.insert("authSessions", {
        sessionId: "session-live",
        userId,
        token: "token-live",
        familyId: "fam-1",
        expiresAt: now + 1_000_000,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("authRefreshTokens", {
        tokenHash: "hash-live",
        sessionId: "session-live",
        userId,
        familyId: "fam-1",
        expiresAt: now + 1_000_000,
        createdAt: now,
        updatedAt: now,
      });
    });

    const replay = await t.mutation(api.native.sessions.rotateSession, {
      oldRefreshTokenHash: "spent-0",
      newSessionId: "session-attacker",
      newSessionToken: "token-attacker",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-attacker",
      newRefreshTokenExpiresAt: now + 1_000_000,
      provider: "password",
      issuer: "native",
    });
    expect(replay).toBeNull();

    const [liveSession, liveRefresh] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db
          .query("authSessions")
          .withIndex("by_session_id", (q) => q.eq("sessionId", "session-live"))
          .unique(),
        ctx.db
          .query("authRefreshTokens")
          .withIndex("by_token_hash", (q) => q.eq("tokenHash", "hash-live"))
          .unique(),
      ]),
    );

    expect(liveSession?.revokedAt).toBeDefined();
    expect(liveRefresh?.revokedAt).toBeDefined();
  });

  it("replaying a rotated-out token does not touch other sessions for the user", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    await insertIdentity(t, userId);
    const now = Date.now();

    // A second, unrelated sign-in (different device / family).
    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "other-session",
      userId,
      token: "other-token",
      sessionExpiresAt: now + 1_000_000,
      refreshTokenHash: "other-hash",
      refreshTokenExpiresAt: now + 1_000_000,
    });

    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "session-1",
      userId,
      token: "token-1",
      sessionExpiresAt: now + 1_000_000,
      refreshTokenHash: "hash-1",
      refreshTokenExpiresAt: now + 1_000_000,
    });
    await t.mutation(api.native.sessions.rotateSession, {
      oldRefreshTokenHash: "hash-1",
      newSessionId: "session-2",
      newSessionToken: "token-2",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-2",
      newRefreshTokenExpiresAt: now + 1_000_000,
      provider: "password",
      issuer: "native",
    });
    // Age the spent token past the grace window so the replay revokes.
    await t.run(async (ctx) => {
      const spent = await ctx.db
        .query("authRefreshTokens")
        .withIndex("by_token_hash", (q) => q.eq("tokenHash", "hash-1"))
        .unique();
      await ctx.db.patch(spent!._id, { rotatedAt: now - 60_000 });
    });
    await t.mutation(api.native.sessions.rotateSession, {
      oldRefreshTokenHash: "hash-1",
      newSessionId: "session-3",
      newSessionToken: "token-3",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-3",
      newRefreshTokenExpiresAt: now + 1_000_000,
      provider: "password",
      issuer: "native",
    });

    const otherSession = await t.run(async (ctx) =>
      ctx.db
        .query("authSessions")
        .withIndex("by_session_id", (q) => q.eq("sessionId", "other-session"))
        .unique(),
    );
    expect(otherSession?.revokedAt).toBeUndefined();
  });

  it("re-presenting a just-rotated token inside the grace window converges instead of revoking", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    await insertIdentity(t, userId);
    const now = Date.now();

    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "session-1",
      userId,
      token: "token-1",
      sessionExpiresAt: now + 1_000_000,
      refreshTokenHash: "hash-1",
      refreshTokenExpiresAt: now + 1_000_000,
    });
    await t.mutation(api.native.sessions.rotateSession, {
      oldRefreshTokenHash: "hash-1",
      newSessionId: "session-2",
      newSessionToken: "token-2",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-2",
      newRefreshTokenExpiresAt: now + 1_000_000,
      provider: "password",
      issuer: "native",
    });

    // The concurrent loser presents the same predecessor token.
    const loser = await t.mutation(api.native.sessions.rotateSession, {
      oldRefreshTokenHash: "hash-1",
      newSessionId: "session-3",
      newSessionToken: "token-3",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-3",
      newRefreshTokenExpiresAt: now + 1_000_000,
      provider: "password",
      issuer: "native",
    });
    expect(loser).toBe("converge");

    // The family must be intact: no mint happened yet, nothing revoked.
    const [winner, winnerToken, noSession3] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db
          .query("authSessions")
          .withIndex("by_session_id", (q) => q.eq("sessionId", "session-2"))
          .unique(),
        ctx.db
          .query("authRefreshTokens")
          .withIndex("by_token_hash", (q) => q.eq("tokenHash", "hash-2"))
          .unique(),
        ctx.db
          .query("authSessions")
          .withIndex("by_session_id", (q) => q.eq("sessionId", "session-3"))
          .unique(),
      ]),
    );
    expect(winner?.revokedAt).toBeUndefined();
    expect(winnerToken?.revokedAt).toBeUndefined();
    expect(noSession3).toBeNull();
  });

  it("convergeSession mints a sibling pair in the family and audits the redemption", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    await insertIdentity(t, userId);
    const now = Date.now();

    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "session-1",
      userId,
      token: "token-1",
      sessionExpiresAt: now + 1_000_000,
      refreshTokenHash: "hash-1",
      refreshTokenExpiresAt: now + 1_000_000,
    });
    await t.mutation(api.native.sessions.rotateSession, {
      oldRefreshTokenHash: "hash-1",
      newSessionId: "session-2",
      newSessionToken: "token-2",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-2",
      newRefreshTokenExpiresAt: now + 1_000_000,
      provider: "password",
      issuer: "native",
    });

    const converged = await t.mutation(api.native.sessions.convergeSession, {
      predecessorRefreshTokenHash: "hash-1",
      newSessionId: "session-3",
      newSessionToken: "token-3",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-3",
      newRefreshTokenExpiresAt: now + 1_000_000,
    });
    expect(converged).toMatchObject({ user: { _id: userId } });

    const [sibling, siblingToken, predecessor] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db
          .query("authSessions")
          .withIndex("by_session_id", (q) => q.eq("sessionId", "session-3"))
          .unique(),
        ctx.db
          .query("authRefreshTokens")
          .withIndex("by_token_hash", (q) => q.eq("tokenHash", "hash-3"))
          .unique(),
        ctx.db
          .query("authRefreshTokens")
          .withIndex("by_token_hash", (q) => q.eq("tokenHash", "hash-1"))
          .unique(),
      ]),
    );
    expect(sibling?.familyId).toBe("session-1");
    expect(siblingToken?.familyId).toBe("session-1");
    expect(predecessor?.graceRedemptions).toBe(1);

    const auditEvents = await t.run(async (ctx) => ctx.db.query("auth_audit_events").take(10));
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      actorType: "system",
      eventType: "refresh_token_converged",
      targetType: "session",
      targetId: "session-1",
      actorUserId: userId,
    });
  });

  it("convergeSession returns null once the redemption cap is exhausted and keeps the family alive", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    await insertIdentity(t, userId);
    const now = Date.now();

    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "session-1",
      userId,
      token: "token-1",
      sessionExpiresAt: now + 1_000_000,
      refreshTokenHash: "hash-1",
      refreshTokenExpiresAt: now + 1_000_000,
    });
    await t.mutation(api.native.sessions.rotateSession, {
      oldRefreshTokenHash: "hash-1",
      newSessionId: "session-2",
      newSessionToken: "token-2",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-2",
      newRefreshTokenExpiresAt: now + 1_000_000,
      provider: "password",
      issuer: "native",
    });

    // Simulate a predecessor that already converged the maximum number of
    // parallel losers.
    await t.run(async (ctx) => {
      const spent = await ctx.db
        .query("authRefreshTokens")
        .withIndex("by_token_hash", (q) => q.eq("tokenHash", "hash-1"))
        .unique();
      await ctx.db.patch(spent!._id, { graceRedemptions: 8 });
    });

    const overCap = await t.mutation(api.native.sessions.convergeSession, {
      predecessorRefreshTokenHash: "hash-1",
      newSessionId: "session-3",
      newSessionToken: "token-3",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-3",
      newRefreshTokenExpiresAt: now + 1_000_000,
    });
    expect(overCap).toBeNull();

    // Fail-soft: the cap must not take down the legitimate family.
    const winner = await t.run(async (ctx) =>
      ctx.db
        .query("authSessions")
        .withIndex("by_session_id", (q) => q.eq("sessionId", "session-2"))
        .unique(),
    );
    expect(winner?.revokedAt).toBeUndefined();
  });

  it("convergeSession refuses to mint into a dead family", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    await insertIdentity(t, userId);
    const now = Date.now();

    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "session-1",
      userId,
      token: "token-1",
      sessionExpiresAt: now + 1_000_000,
      refreshTokenHash: "hash-1",
      refreshTokenExpiresAt: now + 1_000_000,
    });
    await t.mutation(api.native.sessions.rotateSession, {
      oldRefreshTokenHash: "hash-1",
      newSessionId: "session-2",
      newSessionToken: "token-2",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-2",
      newRefreshTokenExpiresAt: now + 1_000_000,
      provider: "password",
      issuer: "native",
    });

    // Sign-out lands inside the grace window: every family session dies while
    // the predecessor's rotatedAt is still fresh.
    await t.run(async (ctx) => {
      const winner = await ctx.db
        .query("authSessions")
        .withIndex("by_session_id", (q) => q.eq("sessionId", "session-2"))
        .unique();
      await ctx.db.patch(winner!._id, { revokedAt: now });
    });

    const result = await t.mutation(api.native.sessions.convergeSession, {
      predecessorRefreshTokenHash: "hash-1",
      newSessionId: "session-3",
      newSessionToken: "token-3",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-3",
      newRefreshTokenExpiresAt: now + 1_000_000,
    });
    expect(result).toBeNull();

    // No resurrection: session-3 must not exist.
    const noSession3 = await t.run(async (ctx) =>
      ctx.db
        .query("authSessions")
        .withIndex("by_session_id", (q) => q.eq("sessionId", "session-3"))
        .unique(),
    );
    expect(noSession3).toBeNull();
  });

  it("convergeSession stops minting once the family hits the live-session cap", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    await insertIdentity(t, userId);
    const now = Date.now();

    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "session-1",
      userId,
      token: "token-1",
      sessionExpiresAt: now + 1_000_000,
      refreshTokenHash: "hash-1",
      refreshTokenExpiresAt: now + 1_000_000,
    });
    await t.mutation(api.native.sessions.rotateSession, {
      oldRefreshTokenHash: "hash-1",
      newSessionId: "session-2",
      newSessionToken: "token-2",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-2",
      newRefreshTokenExpiresAt: now + 1_000_000,
      provider: "password",
      issuer: "native",
    });

    // A family that already holds 10 live sessions (the winner plus 9
    // siblings) is at the bound — no more converge mints.
    await t.run(async (ctx) => {
      for (let i = 0; i < 9; i++) {
        await ctx.db.insert("authSessions", {
          sessionId: `sibling-${i}`,
          userId,
          token: `token-sibling-${i}`,
          familyId: "session-1",
          expiresAt: now + 1_000_000,
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    const result = await t.mutation(api.native.sessions.convergeSession, {
      predecessorRefreshTokenHash: "hash-1",
      newSessionId: "session-3",
      newSessionToken: "token-3",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-3",
      newRefreshTokenExpiresAt: now + 1_000_000,
    });
    expect(result).toBeNull();
  });

  it("an over-cap convergence refusal writes a grace_exhausted audit event", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    await insertIdentity(t, userId);
    const now = Date.now();

    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "session-1",
      userId,
      token: "token-1",
      sessionExpiresAt: now + 1_000_000,
      refreshTokenHash: "hash-1",
      refreshTokenExpiresAt: now + 1_000_000,
    });
    await t.mutation(api.native.sessions.rotateSession, {
      oldRefreshTokenHash: "hash-1",
      newSessionId: "session-2",
      newSessionToken: "token-2",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-2",
      newRefreshTokenExpiresAt: now + 1_000_000,
      provider: "password",
      issuer: "native",
    });
    await t.run(async (ctx) => {
      const spent = await ctx.db
        .query("authRefreshTokens")
        .withIndex("by_token_hash", (q) => q.eq("tokenHash", "hash-1"))
        .unique();
      await ctx.db.patch(spent!._id, { graceRedemptions: 8 });
    });

    const hint = await t.mutation(api.native.sessions.rotateSession, {
      oldRefreshTokenHash: "hash-1",
      newSessionId: "session-3",
      newSessionToken: "token-3",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-3",
      newRefreshTokenExpiresAt: now + 1_000_000,
      provider: "password",
      issuer: "native",
    });
    expect(hint).toBeNull();

    const auditEvents = await t.run(async (ctx) => ctx.db.query("auth_audit_events").take(10));
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      actorType: "system",
      eventType: "refresh_token_grace_exhausted",
      targetType: "session",
      targetId: "session-1",
      actorUserId: userId,
    });
  });

  it("convergeSession revokes the family for a token revoked without rotation", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    await insertIdentity(t, userId);
    const now = Date.now();

    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "session-1",
      userId,
      token: "token-1",
      sessionExpiresAt: now + 1_000_000,
      refreshTokenHash: "hash-1",
      refreshTokenExpiresAt: now + 1_000_000,
    });
    // Sign-out / manual revocation — never rotated through.
    await t.run(async (ctx) => {
      const token = await ctx.db
        .query("authRefreshTokens")
        .withIndex("by_token_hash", (q) => q.eq("tokenHash", "hash-1"))
        .unique();
      await ctx.db.patch(token!._id, { revokedAt: now });
    });

    const result = await t.mutation(api.native.sessions.convergeSession, {
      predecessorRefreshTokenHash: "hash-1",
      newSessionId: "session-3",
      newSessionToken: "token-3",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-3",
      newRefreshTokenExpiresAt: now + 1_000_000,
    });
    expect(result).toBeNull();

    const [session, refresh] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db
          .query("authSessions")
          .withIndex("by_session_id", (q) => q.eq("sessionId", "session-1"))
          .unique(),
        ctx.db
          .query("authRefreshTokens")
          .withIndex("by_token_hash", (q) => q.eq("tokenHash", "hash-1"))
          .unique(),
      ]),
    );
    expect(session?.revokedAt).toBeDefined();
    expect(refresh?.revokedAt).toBeDefined();
  });

  it("rotateSession resolves identity from the session JWT for non-password providers", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    // OAuth-style identity — provider is the OAuth provider id, not "password".
    const oauthDocId = await insertIdentity(t, userId, {
      identityId: "github_subject_1",
      provider: "github",
      subject: "github_subject_1",
      tokenIdentifier: "github_subject_1",
    });
    const now = Date.now();

    // The session token is a JWT whose payload carries the identity doc id —
    // decode (not verify) is enough to resolve which identity minted it.
    const payload = Buffer.from(JSON.stringify({ identityId: oauthDocId })).toString("base64url");
    const sessionJwt = `header.${payload}.signature`;

    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "session-1",
      userId,
      token: sessionJwt,
      sessionExpiresAt: now + 1_000_000,
      refreshTokenHash: "hash-1",
      refreshTokenExpiresAt: now + 1_000_000,
    });

    // Args still say password/native — JWT resolution must override them.
    const result = await t.mutation(api.native.sessions.rotateSession, {
      oldRefreshTokenHash: "hash-1",
      newSessionId: "session-2",
      newSessionToken: "token-2",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-2",
      newRefreshTokenExpiresAt: now + 1_000_000,
      provider: "password",
      issuer: "native",
    });
    expect(result).toMatchObject({ identityId: oauthDocId });
  });
});
