/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
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

describe("admin audit log", () => {
  it("lists audits for a super admin", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);

    await t.run((ctx) =>
      ctx.db.insert("auth_admin_audits", {
        adminId,
        action: "testAction",
        targetType: "user",
        targetId: "target",
        result: "success",
        createdAt: 1,
      }),
    );

    const result = await t
      .withIdentity({ subject: adminId })
      .query(makeFunctionReference<"query">("admin/audit:listAdminAudits"), { limit: 10 });

    expect(result.audits).toHaveLength(1);
    expect(result.audits[0].action).toBe("testAction");
    expect(result.hasNextPage).toBe(false);
  });

  it("rejects listAdminAudits from a non-admin", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t, "user@example.com", "User");

    await expect(
      t
        .withIdentity({ subject: userId })
        .query(makeFunctionReference<"query">("admin/audit:listAdminAudits"), {}),
    ).rejects.toThrow("Forbidden: super admin required");
  });

  it("filters by action", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);

    await t.run((ctx) =>
      ctx.db.insert("auth_admin_audits", {
        adminId,
        action: "createUser",
        targetType: "user",
        targetId: "user-a",
        result: "success",
        createdAt: 1,
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("auth_admin_audits", {
        adminId,
        action: "removeUser",
        targetType: "user",
        targetId: "user-b",
        result: "success",
        createdAt: 2,
      }),
    );

    const result = await t
      .withIdentity({ subject: adminId })
      .query(makeFunctionReference<"query">("admin/audit:listAdminAudits"), {
        action: "create",
        limit: 10,
      });

    expect(result.audits).toHaveLength(1);
    expect(result.audits[0].action).toBe("createUser");
  });

  it("filters by date range", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, "admin@example.com", "Admin", true);

    await t.run((ctx) =>
      ctx.db.insert("auth_admin_audits", {
        adminId,
        action: "createUser",
        targetType: "user",
        targetId: "user-a",
        result: "success",
        createdAt: 100,
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("auth_admin_audits", {
        adminId,
        action: "removeUser",
        targetType: "user",
        targetId: "user-b",
        result: "success",
        createdAt: 200,
      }),
    );

    const result = await t
      .withIdentity({ subject: adminId })
      .query(makeFunctionReference<"query">("admin/audit:listAdminAudits"), {
        from: 50,
        to: 150,
        limit: 10,
      });

    expect(result.audits).toHaveLength(1);
    expect(result.audits[0].createdAt).toBe(100);
  });
});
