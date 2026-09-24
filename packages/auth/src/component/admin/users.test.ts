/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../schema.js";

const rawModules = import.meta.glob(["../_generated/*/*.*s", "./*.*s"]);
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

    const result = await t
      .withIdentity({ subject: adminId })
      .query(makeFunctionReference<"query">("admin/users:listUsers"), { limit: 10 });

    expect(result.users).toHaveLength(2);
    expect(result.hasNextPage).toBe(false);
  });

  it("rejects listUsers from a non-admin", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t, "user@example.com", "User");

    await expect(
      t
        .withIdentity({ subject: userId })
        .query(makeFunctionReference<"query">("admin/users:listUsers"), {}),
    ).rejects.toThrow("Forbidden: super admin required");
  });

  it("gets a user by id", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    const userId = await insertUser(t, "user@example.com", "User");

    const user = await t
      .withIdentity({ subject: adminId })
      .query(makeFunctionReference<"query">("admin/users:getUser"), { userId });

    expect(user?._id).toBe(userId);
    expect(user?.email).toBe("user@example.com");
  });

  it("bans and unbans a user", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    const userId = await insertUser(t, "user@example.com", "User");
    const asAdmin = t.withIdentity({ subject: adminId });
    const bannedUntil = Date.now() + 60_000;

    const banResult = await asAdmin.mutation(
      makeFunctionReference<"mutation">("admin/users:banUser"),
      {
        userId,
        bannedUntil,
        reason: "spam",
      },
    );
    expect(banResult.userId).toBe(userId);
    expect(banResult.bannedUntil).toBe(bannedUntil);

    let user = await asAdmin.query(makeFunctionReference<"query">("admin/users:getUser"), {
      userId,
    });
    expect(user?.bannedUntil).toBe(bannedUntil);
    expect(user?.banReason).toBe("spam");

    await asAdmin.mutation(makeFunctionReference<"mutation">("admin/users:unbanUser"), { userId });

    user = await asAdmin.query(makeFunctionReference<"query">("admin/users:getUser"), { userId });
    expect(user?.bannedUntil).toBeUndefined();
    expect(user?.banReason).toBeUndefined();
  });

  it("prevents self-ban", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);

    await expect(
      t
        .withIdentity({ subject: adminId })
        .mutation(makeFunctionReference<"mutation">("admin/users:banUser"), { userId: adminId }),
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
      .mutation(makeFunctionReference<"mutation">("admin/users:removeUser"), {
        userId,
        reason: "test",
      });
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
      t
        .withIdentity({ subject: adminId })
        .mutation(makeFunctionReference<"mutation">("admin/users:removeUser"), { userId: adminId }),
    ).rejects.toThrow("Cannot remove yourself");
  });

  it("allows the first user to claim super admin", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t, "first@example.com", "First");

    const result = await t
      .withIdentity({ subject: userId })
      .mutation(makeFunctionReference<"mutation">("admin/users:claimSuperAdmin"), {});

    expect(result.userId).toBe(userId);
    const user = await t.run((ctx) => ctx.db.get("users", userId));
    expect(user?.isSuperAdmin).toBe(true);
  });

  it("rejects claimSuperAdmin when a super admin already exists", async () => {
    const t = convexTest(schema, modules);
    await insertUser(t, "admin@example.com", "Admin", true);
    const userId = await insertUser(t, "user@example.com", "User");

    await expect(
      t
        .withIdentity({ subject: userId })
        .mutation(makeFunctionReference<"mutation">("admin/users:claimSuperAdmin"), {}),
    ).rejects.toThrow("A super admin already exists");
  });

  it("rejects claimSuperAdmin for an anonymous user", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t, "anon@example.com", "Anonymous");
    await t.run((ctx) => ctx.db.patch(userId, { isAnonymous: true }));

    await expect(
      t
        .withIdentity({ subject: userId })
        .mutation(makeFunctionReference<"mutation">("admin/users:claimSuperAdmin"), {}),
    ).rejects.toThrow("User is not eligible to claim super admin");
  });

  it("rejects claimSuperAdmin for an inactive user", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t, "inactive@example.com", "Inactive");
    await t.run((ctx) => ctx.db.patch(userId, { isActive: false }));

    await expect(
      t
        .withIdentity({ subject: userId })
        .mutation(makeFunctionReference<"mutation">("admin/users:claimSuperAdmin"), {}),
    ).rejects.toThrow("User is not eligible to claim super admin");
  });

  it("rejects claimSuperAdmin for a currently banned user", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t, "banned@example.com", "Banned");
    const bannedUntil = Date.now() + 60_000;
    await t.run((ctx) => ctx.db.patch(userId, { bannedUntil }));

    await expect(
      t
        .withIdentity({ subject: userId })
        .mutation(makeFunctionReference<"mutation">("admin/users:claimSuperAdmin"), {}),
    ).rejects.toThrow("User is not eligible to claim super admin");
  });

  it("creates a user with a password and role", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);

    const user = await t
      .withIdentity({ subject: adminId })
      .mutation(makeFunctionReference<"mutation">("admin/users:createUser"), {
        email: "new@example.com",
        password: "password123",
        name: "New User",
        role: "admin",
      });

    expect(user.email).toBe("new@example.com");
    expect(user.name).toBe("New User");
    expect(user.isSuperAdmin).toBe(true);
    expect(user.roles).toEqual(["admin"]);

    const identity = await t.run((ctx) =>
      ctx.db
        .query("auth_identities")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(1),
    );
    expect(identity).toHaveLength(1);

    const account = await t.run((ctx) =>
      ctx.db
        .query("authAccounts")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(1),
    );
    expect(account).toHaveLength(1);
  });

  it("rejects creating a user with a duplicate email", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    await insertUser(t, "taken@example.com", "Taken");

    await expect(
      t
        .withIdentity({ subject: adminId })
        .mutation(makeFunctionReference<"mutation">("admin/users:createUser"), {
          email: "taken@example.com",
          password: "password123",
          name: "Taken Again",
        }),
    ).rejects.toThrow("User already exists");
  });

  it("sets a user's role and syncs isSuperAdmin", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    const userId = await insertUser(t, "user@example.com", "User");

    const user = await t
      .withIdentity({ subject: adminId })
      .mutation(makeFunctionReference<"mutation">("admin/users:setRole"), {
        userId,
        role: ["admin", "editor"],
      });

    expect(user.isSuperAdmin).toBe(true);
    expect(user.roles).toEqual(["admin", "editor"]);
  });

  it("prevents self-role changes", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);

    await expect(
      t
        .withIdentity({ subject: adminId })
        .mutation(makeFunctionReference<"mutation">("admin/users:setRole"), {
          userId: adminId,
          role: "user",
        }),
    ).rejects.toThrow("Cannot change your own role");
  });

  it("sets a user's password", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    const userId = await insertUser(t, "user@example.com", "User");

    const result = await t
      .withIdentity({ subject: adminId })
      .mutation(makeFunctionReference<"mutation">("admin/users:setUserPassword"), {
        userId,
        password: "newpassword123",
      });

    expect(result.userId).toBe(userId);

    const account = await t.run((ctx) =>
      ctx.db
        .query("authAccounts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(1),
    );
    expect(account).toHaveLength(1);
  });

  it("filters users by role and active state", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);
    await insertUser(t, "active@example.com", "Active");
    const inactiveId = await insertUser(t, "inactive@example.com", "Inactive");
    await t.run((ctx) => ctx.db.patch(inactiveId, { isActive: false }));

    const result = await t
      .withIdentity({ subject: adminId })
      .query(makeFunctionReference<"query">("admin/users:listUsers"), {
        isActive: true,
        limit: 10,
      });

    expect(result.users.every((u) => u.isActive)).toBe(true);
  });
});
