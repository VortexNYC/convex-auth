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

  it("marks refresh tokens of revoked sessions, sparing the excluded session's", async () => {
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
    const now = Date.now();
    const [deadToken, keptToken] = await t.run(async (ctx) => [
      await ctx.db.insert("authRefreshTokens", {
        tokenHash: "hash-1",
        sessionId: "session-1",
        userId,
        familyId: "fam-1",
        expiresAt: now + 3_600_000,
        createdAt: now,
        updatedAt: now,
      }),
      await ctx.db.insert("authRefreshTokens", {
        tokenHash: "hash-2",
        sessionId: "session-2",
        userId,
        familyId: "fam-2",
        expiresAt: now + 3_600_000,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const revoked = await t.mutation(api.native.sessions.revokeSessionsForUser, {
      userId,
      excludeSessionId: "session-2",
    });
    expect(revoked).toBe(1);

    const [dead, kept] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db.get("authRefreshTokens", deadToken),
        ctx.db.get("authRefreshTokens", keptToken),
      ]),
    );
    expect(dead?.revokedAt).toBeDefined();
    expect(kept?.revokedAt).toBeUndefined();
  });

  it("a replayed sibling token revoked by revoke-other-sessions cannot nuke the caller's session", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    const identityDocId = await insertIdentity(t, userId);
    const now = Date.now();

    for (const [sessionId, hash, familyId] of [
      ["session-A", "hash-A", "fam-A"],
      ["session-B", "hash-B", "fam-A"],
      ["session-C", "hash-C", "fam-C"],
    ] as const) {
      await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
        sessionId,
        familyId,
        userId,
        identityId: identityDocId,
        token: `token-${sessionId}`,
        sessionExpiresAt: now + 1_000_000,
        refreshTokenHash: hash,
        refreshTokenExpiresAt: now + 1_000_000,
      });
    }

    await t.mutation(api.native.sessions.revokeSessionsForUser, {
      userId,
      excludeSessionId: "session-A",
    });

    const replay = await t.mutation(api.native.sessions.rotateSession, {
      oldRefreshTokenHash: "hash-B",
      newSessionId: "session-evil",
      newSessionToken: "token-evil",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-evil",
      newRefreshTokenExpiresAt: now + 1_000_000,
      provider: "password",
      issuer: "native",
    });
    expect(replay).toBeNull();

    const [caller, evil, auditEvents] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db
          .query("authSessions")
          .withIndex("by_session_id", (q) => q.eq("sessionId", "session-A"))
          .unique(),
        ctx.db
          .query("authSessions")
          .withIndex("by_session_id", (q) => q.eq("sessionId", "session-evil"))
          .unique(),
        ctx.db.query("auth_audit_events").take(10),
      ]),
    );
    expect(caller?.revokedAt).toBeUndefined();
    expect(evil).toBeNull();
    expect(auditEvents.filter((e) => e.eventType === "refresh_token_reuse")).toHaveLength(0);
  });

  it("excludeFamilyId spares every session and refresh token in the caller's family", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    const identityDocId = await insertIdentity(t, userId);
    const now = Date.now();

    for (const [sessionId, hash, familyId] of [
      ["session-A", "hash-A", "fam-A"],
      ["session-B", "hash-B", "fam-A"],
      ["session-C", "hash-C", "fam-C"],
    ] as const) {
      await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
        sessionId,
        familyId,
        userId,
        identityId: identityDocId,
        token: `token-${sessionId}`,
        sessionExpiresAt: now + 1_000_000,
        refreshTokenHash: hash,
        refreshTokenExpiresAt: now + 1_000_000,
      });
    }

    const revoked = await t.mutation(api.native.sessions.revokeSessionsForUser, {
      userId,
      excludeSessionId: "session-A",
      excludeFamilyId: "fam-A",
    });
    expect(revoked).toBe(1);

    const [sessions, tokens] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db.query("authSessions").take(10),
        ctx.db.query("authRefreshTokens").take(10),
      ]),
    );
    const sessionById = Object.fromEntries(sessions.map((s) => [s.sessionId, s]));
    expect(sessionById["session-A"].revokedAt).toBeUndefined();
    expect(sessionById["session-B"].revokedAt).toBeUndefined();
    expect(sessionById["session-C"].revokedAt).toBeDefined();
    const tokenByHash = Object.fromEntries(tokens.map((t) => [t.tokenHash, t]));
    expect(tokenByHash["hash-A"].revokedAt).toBeUndefined();
    expect(tokenByHash["hash-B"].revokedAt).toBeUndefined();
    expect(tokenByHash["hash-C"].revokedAt).toBeDefined();
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
    const identityDocId = await insertIdentity(t, userId);
    const now = Date.now();

    await t.mutation(api.native.sessions.createSession, {
      sessionId: "session-1",
      userId,
      identityId: identityDocId,
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
    const identityDocId = await insertIdentity(t, userId);
    const now = Date.now();

    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "session-1",
      userId,
      identityId: identityDocId,
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
    const identityDocId = await insertIdentity(t, userId);
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("authSessions", {
        sessionId: "session-1",
        userId,
        identityId: identityDocId,
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
    const identityDocId = await insertIdentity(t, userId);
    const now = Date.now();

    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "session-1",
      userId,
      identityId: identityDocId,
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

  it("revokeSessionFamilyBySession revokes every family member and spares other families", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    const identityDocId = await insertIdentity(t, userId);
    const now = Date.now();

    for (const [sessionId, token, hash] of [
      ["s-1", "t-1", "h-1"],
      ["s-2", "t-2", "h-2"],
      ["s-3", "t-3", "h-3"],
    ] as const) {
      await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
        sessionId,
        userId,
        identityId: identityDocId,
        token,
        familyId: "fam-1",
        sessionExpiresAt: now + 1_000_000,
        refreshTokenHash: hash,
        refreshTokenExpiresAt: now + 1_000_000,
      });
    }
    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "other",
      userId,
      identityId: identityDocId,
      token: "t-other",
      familyId: "other",
      sessionExpiresAt: now + 1_000_000,
      refreshTokenHash: "h-other",
      refreshTokenExpiresAt: now + 1_000_000,
    });

    const revoked = await t.mutation(api.native.sessions.revokeSessionFamilyBySession, {
      sessionId: "s-2",
    });
    expect(revoked).not.toBeNull();

    const rows = await t.run(async (ctx) => ({
      sessions: await ctx.db.query("authSessions").take(10),
      tokens: await ctx.db.query("authRefreshTokens").take(10),
      audits: await ctx.db.query("auth_audit_events").take(10),
    }));
    for (const sessionId of ["s-1", "s-2", "s-3"]) {
      expect(rows.sessions.find((s) => s.sessionId === sessionId)?.revokedAt).toBeDefined();
      expect(rows.tokens.find((tk) => tk.sessionId === sessionId)?.revokedAt).toBeDefined();
    }
    expect(rows.sessions.find((s) => s.sessionId === "other")?.revokedAt).toBeUndefined();
    expect(rows.tokens.find((tk) => tk.sessionId === "other")?.revokedAt).toBeUndefined();
    expect(rows.audits).toHaveLength(1);
    expect(rows.audits[0]).toMatchObject({
      actorType: "system",
      eventType: "session.sign_out",
      targetType: "session",
      targetId: "fam-1",
      actorUserId: userId,
    });
  });

  it("family replay revocation reaches live rows beyond a 1000-row page", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    await insertIdentity(t, userId);
    const now = Date.now();

    await t.run(async (ctx) => {
      for (let i = 0; i < 1100; i++) {
        await ctx.db.insert("authRefreshTokens", {
          tokenHash: `spent-${i}`,
          sessionId: `spent-session-${i}`,
          userId,
          familyId: "fam-1",
          expiresAt: now + 1_000_000,
          revokedAt: now - 60_000,
          rotatedAt: now - 60_000,
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
    const identityDocId = await insertIdentity(t, userId);
    const now = Date.now();

    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "other-session",
      userId,
      identityId: identityDocId,
      token: "other-token",
      sessionExpiresAt: now + 1_000_000,
      refreshTokenHash: "other-hash",
      refreshTokenExpiresAt: now + 1_000_000,
    });

    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "session-1",
      userId,
      identityId: identityDocId,
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
    const identityDocId = await insertIdentity(t, userId);
    const now = Date.now();

    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "session-1",
      userId,
      identityId: identityDocId,
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
    const identityDocId = await insertIdentity(t, userId);
    const now = Date.now();

    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "session-1",
      userId,
      identityId: identityDocId,
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
    expect(sibling?.identityId).toBe(identityDocId);
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
    const identityDocId = await insertIdentity(t, userId);
    const now = Date.now();

    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "session-1",
      userId,
      identityId: identityDocId,
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

    const overCap = await t.mutation(api.native.sessions.convergeSession, {
      predecessorRefreshTokenHash: "hash-1",
      newSessionId: "session-3",
      newSessionToken: "token-3",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-3",
      newRefreshTokenExpiresAt: now + 1_000_000,
    });
    expect(overCap).toBeNull();

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
    const identityDocId = await insertIdentity(t, userId);
    const now = Date.now();

    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "session-1",
      userId,
      identityId: identityDocId,
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
    const identityDocId = await insertIdentity(t, userId);
    const now = Date.now();

    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "session-1",
      userId,
      identityId: identityDocId,
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
    const identityDocId = await insertIdentity(t, userId);
    const now = Date.now();

    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "session-1",
      userId,
      identityId: identityDocId,
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

  it("convergeSession rejects a token revoked without rotation without nuking the family", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    const identityDocId = await insertIdentity(t, userId);
    const now = Date.now();

    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "session-1",
      userId,
      identityId: identityDocId,
      token: "token-1",
      sessionExpiresAt: now + 1_000_000,
      refreshTokenHash: "hash-1",
      refreshTokenExpiresAt: now + 1_000_000,
    });
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

    const [session, refresh, minted, auditEvents] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db
          .query("authSessions")
          .withIndex("by_session_id", (q) => q.eq("sessionId", "session-1"))
          .unique(),
        ctx.db
          .query("authRefreshTokens")
          .withIndex("by_token_hash", (q) => q.eq("tokenHash", "hash-1"))
          .unique(),
        ctx.db
          .query("authSessions")
          .withIndex("by_session_id", (q) => q.eq("sessionId", "session-3"))
          .unique(),
        ctx.db.query("auth_audit_events").take(10),
      ]),
    );
    expect(session?.revokedAt).toBeUndefined();
    expect(refresh?.revokedAt).toBeDefined();
    expect(minted).toBeNull();
    expect(auditEvents).toHaveLength(0);
  });

  it("rotateSession resolves identity from the session JWT for non-password providers", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    const oauthDocId = await insertIdentity(t, userId, {
      identityId: "github_subject_1",
      provider: "github",
      subject: "github_subject_1",
      tokenIdentifier: "github_subject_1",
    });
    const now = Date.now();

    const payload = Buffer.from(JSON.stringify({ identityId: oauthDocId })).toString("base64url");
    const sessionJwt = `header.${payload}.signature`;

    await t.run(async (ctx) => {
      await ctx.db.insert("authSessions", {
        sessionId: "session-1",
        userId,
        token: sessionJwt,
        expiresAt: now + 1_000_000,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("authRefreshTokens", {
        tokenHash: "hash-1",
        sessionId: "session-1",
        userId,
        expiresAt: now + 1_000_000,
        createdAt: now,
        updatedAt: now,
      });
    });
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

  it("rotateSession fails closed for a session with no resolvable identity", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    const identityDocId = await insertIdentity(t, userId);
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("authSessions", {
        sessionId: "session-1",
        userId,
        token: "opaque-token",
        expiresAt: now + 1_000_000,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("authRefreshTokens", {
        tokenHash: "hash-1",
        sessionId: "session-1",
        userId,
        expiresAt: now + 1_000_000,
        createdAt: now,
        updatedAt: now,
      });
    });

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
    expect(result).toBeNull();

    const [session2, identity] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db
          .query("authSessions")
          .withIndex("by_session_id", (q) => q.eq("sessionId", "session-2"))
          .unique(),
        ctx.db.get("auth_identities", identityDocId),
      ]),
    );
    expect(session2).toBeNull();
    expect(identity).not.toBeNull();
  });

  it("convergeSession resolves a claim-only predecessor and writes the identity doc id on the sibling", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    const oauthDocId = await insertIdentity(t, userId, {
      identityId: "github_subject_2",
      provider: "github",
      subject: "github_subject_2",
      tokenIdentifier: "github_subject_2",
    });
    const now = Date.now();

    const payload = Buffer.from(JSON.stringify({ identityId: oauthDocId })).toString("base64url");
    const sessionJwt = `header.${payload}.signature`;
    await t.run(async (ctx) => {
      await ctx.db.insert("authSessions", {
        sessionId: "session-1",
        userId,
        token: sessionJwt,
        expiresAt: now + 1_000_000,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("authRefreshTokens", {
        tokenHash: "hash-1",
        sessionId: "session-1",
        userId,
        expiresAt: now + 1_000_000,
        createdAt: now,
        updatedAt: now,
      });
    });

    const rotated = await t.mutation(api.native.sessions.rotateSession, {
      oldRefreshTokenHash: "hash-1",
      newSessionId: "session-2",
      newSessionToken: "token-2",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-2",
      newRefreshTokenExpiresAt: now + 1_000_000,
      provider: "password",
      issuer: "native",
    });
    expect(rotated).toMatchObject({ identityId: oauthDocId });

    const result = await t.mutation(api.native.sessions.convergeSession, {
      predecessorRefreshTokenHash: "hash-1",
      newSessionId: "session-3",
      newSessionToken: "token-3",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-3",
      newRefreshTokenExpiresAt: now + 1_000_000,
    });
    expect(result).not.toBeNull();

    const sibling = await t.run(async (ctx) =>
      ctx.db
        .query("authSessions")
        .withIndex("by_session_id", (q) => q.eq("sessionId", "session-3"))
        .unique(),
    );
    expect(sibling?.identityId).toBe(oauthDocId);
  });

  it("convergeSession fails closed instead of minting an identity-less sibling", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    await insertIdentity(t, userId);
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("authSessions", {
        sessionId: "session-1",
        userId,
        token: "opaque-token",
        expiresAt: now + 1_000_000,
        revokedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("authSessions", {
        sessionId: "session-2",
        userId,
        token: "token-2",
        familyId: "session-1",
        expiresAt: now + 1_000_000,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("authRefreshTokens", {
        tokenHash: "hash-1",
        sessionId: "session-1",
        userId,
        familyId: "session-1",
        expiresAt: now + 1_000_000,
        revokedAt: now,
        rotatedAt: now,
        createdAt: now,
        updatedAt: now,
      });
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

    const [noSession3, predecessor] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db
          .query("authSessions")
          .withIndex("by_session_id", (q) => q.eq("sessionId", "session-3"))
          .unique(),
        ctx.db
          .query("authRefreshTokens")
          .withIndex("by_token_hash", (q) => q.eq("tokenHash", "hash-1"))
          .unique(),
      ]),
    );
    expect(noSession3).toBeNull();
    expect(predecessor?.graceRedemptions ?? 0).toBe(0);
  });

  it("propagates impersonatedBy through rotation and convergence", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    const adminId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "admin@example.com",
        name: "Admin",
        emailVerified: true,
        isActive: true,
        isSuperAdmin: true,
        createdAt: 0,
        updatedAt: 0,
      }),
    );
    const identityDocId = await insertIdentity(t, userId);
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("authSessions", {
        sessionId: "session-1",
        familyId: "session-1",
        userId,
        identityId: identityDocId,
        impersonatedBy: adminId,
        token: "token-1",
        expiresAt: now + 1_000_000,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("authRefreshTokens", {
        tokenHash: "hash-1",
        sessionId: "session-1",
        userId,
        familyId: "session-1",
        expiresAt: now + 1_000_000,
        createdAt: now,
        updatedAt: now,
      });
    });

    const rotated = await t.mutation(api.native.sessions.rotateSession, {
      oldRefreshTokenHash: "hash-1",
      newSessionId: "session-2",
      newSessionToken: "token-2",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-2",
      newRefreshTokenExpiresAt: now + 1_000_000,
      provider: "password",
      issuer: "native",
    });
    expect(rotated).not.toBeNull();

    const rotatedSession = await t.run(async (ctx) =>
      ctx.db
        .query("authSessions")
        .withIndex("by_session_id", (q) => q.eq("sessionId", "session-2"))
        .unique(),
    );
    expect(rotatedSession?.impersonatedBy).toBe(adminId);

    const converged = await t.mutation(api.native.sessions.convergeSession, {
      predecessorRefreshTokenHash: "hash-1",
      newSessionId: "session-3",
      newSessionToken: "token-3",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-3",
      newRefreshTokenExpiresAt: now + 1_000_000,
    });
    expect(converged).not.toBeNull();

    const siblingSession = await t.run(async (ctx) =>
      ctx.db
        .query("authSessions")
        .withIndex("by_session_id", (q) => q.eq("sessionId", "session-3"))
        .unique(),
    );
    expect(siblingSession?.impersonatedBy).toBe(adminId);
  });

  it("refuses convergence when the family exceeds the scan budget", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    const now = Date.now();

    const identityDocId = await insertIdentity(t, userId);
    await t.run(async (ctx) => {
      await ctx.db.insert("authSessions", {
        sessionId: "session-1",
        familyId: "session-1",
        userId,
        identityId: identityDocId,
        token: "token-1",
        expiresAt: now + 1_000_000,
        createdAt: now,
        updatedAt: now,
      });
      for (let i = 0; i < 2000; i++) {
        await ctx.db.insert("authSessions", {
          sessionId: `dead-${i}`,
          familyId: "session-1",
          userId,
          token: `token-dead-${i}`,
          expiresAt: now + 1_000_000,
          revokedAt: now - 60_000,
          createdAt: now - 60_000,
          updatedAt: now - 60_000,
        });
      }
      await ctx.db.insert("authRefreshTokens", {
        tokenHash: "hash-1",
        sessionId: "session-1",
        userId,
        familyId: "session-1",
        expiresAt: now + 1_000_000,
        revokedAt: now,
        rotatedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });

    const result = await t.mutation(api.native.sessions.convergeSession, {
      predecessorRefreshTokenHash: "hash-1",
      newSessionId: "session-2",
      newSessionToken: "token-2",
      newSessionExpiresAt: now + 1_000_000,
      newRefreshTokenHash: "hash-2",
      newRefreshTokenExpiresAt: now + 1_000_000,
    });
    expect(result).toBeNull();

    const sibling = await t.run(async (ctx) =>
      ctx.db
        .query("authSessions")
        .withIndex("by_session_id", (q) => q.eq("sessionId", "session-2"))
        .unique(),
    );
    expect(sibling).toBeNull();
  });

  it("returns rotated refresh token rows through the public query", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("authRefreshTokens", {
        tokenHash: "hash-rotated",
        sessionId: "session-1",
        userId,
        familyId: "session-1",
        expiresAt: now + 1_000_000,
        revokedAt: now,
        rotatedAt: now,
        graceRedemptions: 3,
        createdAt: now,
        updatedAt: now,
      });
    });

    const row = await t.query(api.native.refreshTokens.getRefreshTokenByTokenHash, {
      tokenHash: "hash-rotated",
    });
    expect(row?.familyId).toBe("session-1");
    expect(row?.rotatedAt).toBe(now);
    expect(row?.graceRedemptions).toBe(3);
  });
});
