import { describe, expect, it } from "vitest";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel } from "../../component/_generated/dataModel.js";
import { createAdminAudit, isUserBanned, requireSuperAdmin, type AdminAuditArgs } from "./admin.js";

type UserDoc = {
  _id: string;
  isActive: boolean;
  isSuperAdmin?: boolean;
  bannedUntil?: number;
};

function makeQueryCtx(user: UserDoc | null): GenericQueryCtx<DataModel> {
  return {
    db: {
      get: (async () =>
        Promise.resolve(
          user as unknown as never,
        )) as unknown as GenericQueryCtx<DataModel>["db"]["get"],
    },
  } as unknown as GenericQueryCtx<DataModel>;
}

function makeMutationCtx(): {
  ctx: GenericMutationCtx<DataModel>;
  calls: { table: string; value: Record<string, unknown> }[];
} {
  const calls: { table: string; value: Record<string, unknown> }[] = [];
  const ctx = {
    db: {
      insert: (async (table: string, value: Record<string, unknown>) => {
        calls.push({ table, value });
        return "u_1" as unknown as never;
      }) as unknown as GenericMutationCtx<DataModel>["db"]["insert"],
    },
  } as unknown as GenericMutationCtx<DataModel>;
  return { ctx, calls };
}

describe("isUserBanned", () => {
  it("returns false for an active, unbanned user", () => {
    expect(isUserBanned({ isActive: true })).toBe(false);
  });

  it("returns true for an inactive user", () => {
    expect(isUserBanned({ isActive: false })).toBe(true);
  });

  it("returns true when bannedUntil is in the future", () => {
    expect(isUserBanned({ isActive: true, bannedUntil: Date.now() + 1_000_000 })).toBe(true);
  });

  it("returns false when bannedUntil is in the past", () => {
    expect(isUserBanned({ isActive: true, bannedUntil: Date.now() - 1_000_000 })).toBe(false);
  });
});

describe("requireSuperAdmin", () => {
  it("throws when the user does not exist", async () => {
    const ctx = makeQueryCtx(null);
    await expect(requireSuperAdmin(ctx, "u_1")).rejects.toThrow("Admin user not found");
  });

  it("throws when the user is not a super admin", async () => {
    const ctx = makeQueryCtx({ _id: "u_1", isActive: true, isSuperAdmin: false });
    await expect(requireSuperAdmin(ctx, "u_1")).rejects.toThrow("Forbidden: super admin required");
  });

  it("throws when the admin is inactive", async () => {
    const ctx = makeQueryCtx({ _id: "u_1", isActive: false, isSuperAdmin: true });
    await expect(requireSuperAdmin(ctx, "u_1")).rejects.toThrow("Admin user is banned");
  });

  it("throws when the admin is currently banned", async () => {
    const ctx = makeQueryCtx({
      _id: "u_1",
      isActive: true,
      isSuperAdmin: true,
      bannedUntil: Date.now() + 1_000_000,
    });
    await expect(requireSuperAdmin(ctx, "u_1")).rejects.toThrow("Admin user is banned");
  });

  it("returns the user when they are an active super admin", async () => {
    const user = { _id: "u_1", isActive: true, isSuperAdmin: true };
    const ctx = makeQueryCtx(user);
    const result = await requireSuperAdmin(ctx, "u_1");
    expect(result).toEqual(user);
  });
});

describe("createAdminAudit", () => {
  it("inserts a record with the supplied fields and serialised payload", async () => {
    const { ctx, calls } = makeMutationCtx();
    const args: AdminAuditArgs = {
      adminId: "u_1",
      action: "banUser",
      target: { type: "user", id: "u_2" },
      result: "success",
      payload: { reason: "spam" },
      now: 12345,
    };

    await createAdminAudit(ctx, args);

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("auth_admin_audits");
    expect(calls[0].value).toMatchObject({
      adminId: "u_1",
      action: "banUser",
      targetType: "user",
      targetId: "u_2",
      result: "success",
      payloadJson: JSON.stringify({ reason: "spam" }),
      createdAt: 12345,
    });
  });

  it("omits payloadJson when no payload is provided", async () => {
    const { ctx, calls } = makeMutationCtx();
    const args: AdminAuditArgs = {
      adminId: "u_1",
      action: "unbanUser",
      target: { type: "user", id: "u_2" },
      result: "success",
      now: 12345,
    };

    await createAdminAudit(ctx, args);

    expect(calls[0].value).toMatchObject({
      payloadJson: undefined,
      createdAt: 12345,
    });
  });
});
