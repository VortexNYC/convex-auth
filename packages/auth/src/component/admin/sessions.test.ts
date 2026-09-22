/// <reference types="vite/client" />

import { beforeAll, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { generateKeyPair, exportJWK } from "jose";
import schema from "../schema.js";
import type { Id } from "../_generated/dataModel.js";

const rawModules = import.meta.glob(["../_generated/**/*.*s", "./*.*s"]);
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([path, loader]) => {
    const withoutExt = path.replace(/\.[^.]+$/, "");
    const normalized = withoutExt.startsWith("./")
      ? withoutExt.replace("./", "admin/")
      : withoutExt.replace("../", "");
    return [normalized, loader];
  }),
);

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
  overrides: { revokedAt?: number; familyId?: string; impersonatedBy?: Id<"users"> } = {},
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
      familyId: overrides.familyId,
      impersonatedBy: overrides.impersonatedBy,
      createdAt: 0,
      updatedAt: 0,
    }),
  )) as Id<"authSessions">;
}

async function insertRefreshToken(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  sessionId: string,
  familyId?: string,
): Promise<Id<"authRefreshTokens">> {
  return (await t.run((ctx) =>
    ctx.db.insert("authRefreshTokens", {
      tokenHash: `hash-${sessionId}`,
      sessionId,
      userId,
      familyId,
      expiresAt: Date.now() + 3600_000,
      revokedAt: undefined,
      createdAt: 0,
      updatedAt: 0,
    }),
  )) as Id<"authRefreshTokens">;
}

async function insertNativeIdentity(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  subject = crypto.randomUUID(),
): Promise<Id<"auth_identities">> {
  return (await t.run((ctx) =>
    ctx.db.insert("auth_identities", {
      identityId: crypto.randomUUID(),
      userId,
      provider: "password",
      issuer: "native",
      subject,
      tokenIdentifier: `native:password:${subject}`,
      emailVerified: false,
      createdAt: 0,
      updatedAt: 0,
    }),
  )) as Id<"auth_identities">;
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  const privateJwk = await exportJWK(pair.privateKey);
  const publicJwk = await exportJWK(pair.publicKey);
  process.env.JWT_PRIVATE_KEY = JSON.stringify(privateJwk);
  process.env.JWKS = JSON.stringify({ keys: [{ use: "sig", ...publicJwk }] });
  process.env.CONVEX_SITE_URL = "http://localhost:5174";
});

describe("admin sessions", () => {
  it("lists sessions for a super admin", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    const userId = await insertUser(t, "user@example.com", "User");
    await insertSession(t, userId, "sess-1");
    await insertSession(t, userId, "sess-2");

    const result = await t
      .withIdentity({ subject: adminId })
      .query(makeFunctionReference<"query">("admin/sessions:listSessions"), { limit: 10 });

    expect(result.sessions).toHaveLength(2);
    expect(result.sessions[0].sessionId).toBe("sess-2");
    expect(result.hasNextPage).toBe(false);
  });

  it("rejects listSessions from a non-admin", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t, "user@example.com", "User");

    await expect(
      t
        .withIdentity({ subject: userId })
        .query(makeFunctionReference<"query">("admin/sessions:listSessions"), {}),
    ).rejects.toThrow("Forbidden: super admin required");
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
      .query(makeFunctionReference<"query">("admin/sessions:listSessions"), {
        userId: userA,
        limit: 10,
      });

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
      .query(makeFunctionReference<"query">("admin/sessions:getSession"), { sessionId: "sess-1" });

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
      .mutation(makeFunctionReference<"mutation">("admin/sessions:revokeSession"), {
        sessionId: "sess-1",
      });
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

  it("revokes the whole session family, sparing other families", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    const userId = await insertUser(t, "user@example.com", "User");
    const presented = await insertSession(t, userId, "sess-a", { familyId: "fam-1" });
    const sibling = await insertSession(t, userId, "sess-b", { familyId: "fam-1" });
    const otherFamily = await insertSession(t, userId, "sess-c", { familyId: "fam-2" });
    const siblingToken = await insertRefreshToken(t, userId, "sess-b", "fam-1");
    const otherToken = await insertRefreshToken(t, userId, "sess-c", "fam-2");

    const result = await t
      .withIdentity({ subject: adminId })
      .mutation(makeFunctionReference<"mutation">("admin/sessions:revokeSession"), {
        sessionId: "sess-a",
      });
    expect(result.revoked).toBe(true);

    const [a, b, c, tokB, tokC] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db.get("authSessions", presented),
        ctx.db.get("authSessions", sibling),
        ctx.db.get("authSessions", otherFamily),
        ctx.db.get("authRefreshTokens", siblingToken),
        ctx.db.get("authRefreshTokens", otherToken),
      ]),
    );
    expect(a?.revokedAt).toBeDefined();
    expect(b?.revokedAt).toBeDefined();
    expect(tokB?.revokedAt).toBeDefined();
    expect(c?.revokedAt).toBeUndefined();
    expect(tokC?.revokedAt).toBeUndefined();

    const audits = await t.run((ctx) =>
      ctx.db
        .query("auth_admin_audits")
        .withIndex("by_admin", (q) => q.eq("adminId", adminId))
        .take(1),
    );
    expect(audits[0]?.action).toBe("revokeSession");
    expect(JSON.parse(audits[0]?.payloadJson ?? "{}")).toMatchObject({ familyId: "fam-1" });
  });

  it("revokes all active sessions for a user", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    const userId = await insertUser(t, "user@example.com", "User");
    const activeSession = await insertSession(t, userId, "sess-active");
    await insertSession(t, userId, "sess-revoked", { revokedAt: 1 });

    const result = await t
      .withIdentity({ subject: adminId })
      .mutation(makeFunctionReference<"mutation">("admin/sessions:revokeAllSessionsForUser"), {
        userId,
      });
    expect(result.count).toBe(1);

    const session = await t.run((ctx) => ctx.db.get("authSessions", activeSession));
    expect(session?.revokedAt).toBeDefined();
  });

  it("creates an impersonated session for a super admin", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    const userId = await insertUser(t, "user@example.com", "User");
    const identityDocId = await insertNativeIdentity(t, userId);

    const result = await t
      .withIdentity({ subject: adminId })
      .mutation(makeFunctionReference<"mutation">("admin/sessions:impersonateUser"), { userId });

    expect(result.token).toBeDefined();
    expect(result.sessionId).toBeDefined();
    expect(result.refreshToken).toBeDefined();

    const session = await t
      .withIdentity({ subject: userId })
      .query(makeFunctionReference<"query">("admin/sessions:getImpersonationState"), {
        sessionId: result.sessionId,
      });
    expect(session?.impersonatedBy).toBe(String(adminId));
    expect(session?.userId).toBe(String(userId));

    // The impersonated session carries the impersonated user's identity so
    // the refresh path can resolve it column-first.
    const sessionRow = await t.run((ctx) =>
      ctx.db
        .query("authSessions")
        .withIndex("by_session_id", (q) => q.eq("sessionId", result.sessionId))
        .unique(),
    );
    expect(sessionRow?.identityId).toBe(identityDocId);

    const audits = await t.run((ctx) =>
      ctx.db
        .query("auth_admin_audits")
        .withIndex("by_admin", (q) => q.eq("adminId", adminId))
        .take(1),
    );
    expect(audits[0]?.action).toBe("impersonateUser");
  });

  it("rejects impersonation without a native identity", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    const userId = await insertUser(t, "user@example.com", "User");

    await expect(
      t
        .withIdentity({ subject: adminId })
        .mutation(makeFunctionReference<"mutation">("admin/sessions:impersonateUser"), { userId }),
    ).rejects.toThrow("Cannot impersonate a user without a native identity");
  });

  it("rejects impersonation from a non-admin", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t, "user@example.com", "User");
    await insertNativeIdentity(t, userId);

    await expect(
      t
        .withIdentity({ subject: userId })
        .mutation(makeFunctionReference<"mutation">("admin/sessions:impersonateUser"), { userId }),
    ).rejects.toThrow("Forbidden: super admin required");
  });

  it("stopImpersonation revokes the whole session family, not just the presented session", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    const userId = await insertUser(t, "user@example.com", "User");

    // The impersonated session plus a converged sibling in the same family —
    // both must die, or the sibling's refresh token keeps minting sessions.
    await insertSession(t, userId, "imp-1", { familyId: "fam-imp", impersonatedBy: adminId });
    await insertRefreshToken(t, userId, "imp-1", "fam-imp");
    await insertSession(t, userId, "imp-2", { familyId: "fam-imp" });
    await insertRefreshToken(t, userId, "imp-2", "fam-imp");
    await insertSession(t, userId, "other-device", { familyId: "fam-other" });

    const result = await t
      .withIdentity({ subject: String(userId) })
      .mutation(makeFunctionReference<"mutation">("admin/sessions:stopImpersonation"), {
        sessionId: "imp-1",
      });
    expect(result).toEqual({ revoked: true });

    const [imp1, imp2, other, tok1, tok2] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db
          .query("authSessions")
          .withIndex("by_session_id", (q) => q.eq("sessionId", "imp-1"))
          .unique(),
        ctx.db
          .query("authSessions")
          .withIndex("by_session_id", (q) => q.eq("sessionId", "imp-2"))
          .unique(),
        ctx.db
          .query("authSessions")
          .withIndex("by_session_id", (q) => q.eq("sessionId", "other-device"))
          .unique(),
        ctx.db
          .query("authRefreshTokens")
          .withIndex("by_session", (q) => q.eq("sessionId", "imp-1"))
          .unique(),
        ctx.db
          .query("authRefreshTokens")
          .withIndex("by_session", (q) => q.eq("sessionId", "imp-2"))
          .unique(),
      ]),
    );
    expect(imp1?.revokedAt).toBeDefined();
    expect(imp2?.revokedAt).toBeDefined();
    expect(tok1?.revokedAt).toBeDefined();
    expect(tok2?.revokedAt).toBeDefined();
    expect(other?.revokedAt).toBeUndefined();

    const audits = await t.run((ctx) =>
      ctx.db
        .query("auth_admin_audits")
        .withIndex("by_admin", (q) => q.eq("adminId", String(adminId)))
        .take(10),
    );
    expect(audits[0]?.action).toBe("stopImpersonation");
  });
});
