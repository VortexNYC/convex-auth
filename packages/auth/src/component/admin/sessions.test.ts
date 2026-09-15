/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema.js";
import type { Id } from "../_generated/dataModel.js";
import { getSession, listSessions, revokeAllSessionsForUser, revokeSession } from "./sessions.js";

const modules = import.meta.glob("../**/*.*s");

async function insertUser(
  t: ReturnType<typeof convexTest>,
  email: string,
  name: string,
  isSuperAdmin = false,
): Promise<Id<"users">> {
  return (await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name,
      emailVerified: false,
      isActive: true,
      isSuperAdmin,
      createdAt: 0,
      updatedAt: 0,
    }),
  )) as Id<"users">;
}

async function insertSession(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  sessionId: string,
  overrides: { revokedAt?: number } = {},
): Promise<Id<"authSessions">> {
  return (await t.run((ctx) =>
    ctx.db.insert("authSessions", {
      sessionId,
      userId,
      token: `token-${sessionId}`,
      expiresAt: Date.now() + 3600_000,
      ipAddress: "127.0.0.1",
      userAgent: "test",
      revokedAt: overrides.revokedAt,
      createdAt: 0,
      updatedAt: 0,
    }),
  )) as Id<"authSessions">;
}

async function insertRefreshToken(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  sessionId: string,
): Promise<Id<"authRefreshTokens">> {
  return (await t.run((ctx) =>
    ctx.db.insert("authRefreshTokens", {
      tokenHash: `hash-${sessionId}`,
      sessionId,
      userId,
      expiresAt: Date.now() + 3600_000,
      revokedAt: undefined,
      createdAt: 0,
      updatedAt: 0,
    }),
  )) as Id<"authRefreshTokens">;
}

describe("admin sessions", () => {
  it("lists sessions for a super admin", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    const userId = await insertUser(t, "user@example.com", "User");
    await insertSession(t, userId, "sess-1");
    await insertSession(t, userId, "sess-2");

    const result = await t.withIdentity({ subject: adminId }).query(listSessions, { limit: 10 });

    expect(result.sessions).toHaveLength(2);
    expect(result.sessions[0].sessionId).toBe("sess-2");
    expect(result.hasNextPage).toBe(false);
  });

  it("rejects listSessions from a non-admin", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t, "user@example.com", "User");

    await expect(t.withIdentity({ subject: userId }).query(listSessions, {})).rejects.toThrow(
      "Forbidden: super admin required",
    );
  });

  it("lists sessions filtered by user", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    const userA = await insertUser(t, "a@example.com", "User A");
    const userB = await insertUser(t, "b@example.com", "User B");
    await insertSession(t, userA, "sess-a");
    await insertSession(t, userB, "sess-b");

    const result = await t
      .withIdentity({ subject: adminId })
      .query(listSessions, { userId: userA, limit: 10 });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].sessionId).toBe("sess-a");
  });

  it("gets a session by sessionId", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    const userId = await insertUser(t, "user@example.com", "User");
    await insertSession(t, userId, "sess-1");

    const session = await t
      .withIdentity({ subject: adminId })
      .query(getSession, { sessionId: "sess-1" });

    expect(session?.sessionId).toBe("sess-1");
  });

  it("revokes a session and its refresh tokens", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    const userId = await insertUser(t, "user@example.com", "User");
    const sessionId = await insertSession(t, userId, "sess-1");
    const tokenId = await insertRefreshToken(t, userId, "sess-1");

    const result = await t
      .withIdentity({ subject: adminId })
      .mutation(revokeSession, { sessionId: "sess-1" });
    expect(result.revoked).toBe(true);

    const session = await t.run((ctx) => ctx.db.get("authSessions", sessionId));
    expect(session?.revokedAt).toBeDefined();

    const token = await t.run((ctx) => ctx.db.get("authRefreshTokens", tokenId));
    expect(token?.revokedAt).toBeDefined();

    const audits = await t.run((ctx) =>
      ctx.db
        .query("auth_admin_audits")
        .withIndex("by_admin", (q) => q.eq("adminId", adminId))
        .take(1),
    );
    expect(audits[0]?.action).toBe("revokeSession");
  });

  it("revokes all active sessions for a user", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    const userId = await insertUser(t, "user@example.com", "User");
    const activeSession = await insertSession(t, userId, "sess-active");
    await insertSession(t, userId, "sess-revoked", { revokedAt: 1 });

    const result = await t
      .withIdentity({ subject: adminId })
      .mutation(revokeAllSessionsForUser, { userId });
    expect(result.count).toBe(1);

    const session = await t.run((ctx) => ctx.db.get("authSessions", activeSession));
    expect(session?.revokedAt).toBeDefined();
  });
});
