/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema.js";
import { banUser, getUser, listUsers, removeUser, unbanUser } from "./users.js";

const modules = import.meta.glob("../**/*.*s");

async function insertUser(
  t: ReturnType<typeof convexTest>,
  email: string,
  name: string,
  isSuperAdmin = false,
) {
  return await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name,
      emailVerified: false,
      isActive: true,
      isSuperAdmin,
      createdAt: 0,
      updatedAt: 0,
    }),
  );
}

describe("admin users", () => {
  it("lists users for a super admin", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    await insertUser(t, "user@example.com", "User");

    const result = await t.withIdentity({ subject: adminId }).query(listUsers, { limit: 10 });

    expect(result.users).toHaveLength(2);
    expect(result.hasNextPage).toBe(false);
  });

  it("rejects listUsers from a non-admin", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t, "user@example.com", "User");

    await expect(t.withIdentity({ subject: userId }).query(listUsers, {})).rejects.toThrow(
      "Forbidden: super admin required",
    );
  });

  it("gets a user by id", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    const userId = await insertUser(t, "user@example.com", "User");

    const user = await t.withIdentity({ subject: adminId }).query(getUser, { userId });

    expect(user?._id).toBe(userId);
    expect(user?.email).toBe("user@example.com");
  });

  it("bans and unbans a user", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    const userId = await insertUser(t, "user@example.com", "User");
    const asAdmin = t.withIdentity({ subject: adminId });
    const bannedUntil = Date.now() + 60_000;

    const banResult = await asAdmin.mutation(banUser, {
      userId,
      bannedUntil,
      reason: "spam",
    });
    expect(banResult.userId).toBe(userId);
    expect(banResult.bannedUntil).toBe(bannedUntil);

    let user = await asAdmin.query(getUser, { userId });
    expect(user?.bannedUntil).toBe(bannedUntil);
    expect(user?.banReason).toBe("spam");

    await asAdmin.mutation(unbanUser, { userId });

    user = await asAdmin.query(getUser, { userId });
    expect(user?.bannedUntil).toBeUndefined();
    expect(user?.banReason).toBeUndefined();
  });

  it("prevents self-ban", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);

    await expect(
      t.withIdentity({ subject: adminId }).mutation(banUser, { userId: adminId }),
    ).rejects.toThrow("Cannot ban yourself");
  });

  it("removes a user and their auth records", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    const userId = await insertUser(t, "user@example.com", "User");

    await t.run((ctx) =>
      ctx.db.insert("auth_identities", {
        userId,
        identityId: "id",
        provider: "password",
        issuer: "native",
        subject: "subject",
        tokenIdentifier: "subject",
        emailVerified: false,
        sessionId: null,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    const result = await t
      .withIdentity({ subject: adminId })
      .mutation(removeUser, { userId, reason: "test" });
    expect(result.deleted).toBe(true);

    const user = await t.run((ctx) => ctx.db.get("users", userId));
    expect(user).toBeNull();

    const identities = await t.run((ctx) =>
      ctx.db
        .query("auth_identities")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(1),
    );
    expect(identities).toHaveLength(0);
  });

  it("prevents self-removal", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);

    await expect(
      t.withIdentity({ subject: adminId }).mutation(removeUser, { userId: adminId }),
    ).rejects.toThrow("Cannot remove yourself");
  });
});
