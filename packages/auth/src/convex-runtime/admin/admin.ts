import type { GenericQueryCtx, GenericMutationCtx } from "convex/server";
import type { GenericId } from "convex/values";
import type { DataModel, Id } from "../../component/_generated/dataModel.js";

export type AdminAuditTarget =
  | { type: "user"; id: string }
  | { type: "session"; id: string }
  | { type: "organization"; id: string };

export type AdminAuditArgs = {
  adminId: string;
  action: string;
  target: AdminAuditTarget;
  result: "success" | "denied" | "error";
  payload?: Record<string, unknown>;
  now?: number;
};

export type AdminUser = {
  _id: Id<"users">;
  isSuperAdmin?: boolean;
  bannedUntil?: number;
  isActive: boolean;
};

export async function requireSuperAdmin(
  ctx: GenericQueryCtx<DataModel>,
  userId: string,
): Promise<AdminUser> {
  const user = await ctx.db.get("users", userId as unknown as GenericId<"users">);
  if (user === null) {
    throw new Error("Admin user not found");
  }
  if (!user.isSuperAdmin) {
    throw new Error("Forbidden: super admin required");
  }
  if (isUserBanned(user)) {
    throw new Error("Admin user is banned");
  }
  return user as AdminUser;
}

export function isUserBanned(user: {
  bannedAt?: number;
  bannedUntil?: number;
  isActive: boolean;
}): boolean {
  const now = Date.now();
  if (!user.isActive) {
    return true;
  }
  if (user.bannedUntil !== undefined && user.bannedUntil > now) {
    return true;
  }
  return user.bannedAt !== undefined && user.bannedUntil === undefined;
}

export async function createAdminAudit(
  ctx: GenericMutationCtx<DataModel>,
  args: AdminAuditArgs,
): Promise<void> {
  await ctx.db.insert("auth_admin_audits", {
    adminId: args.adminId as unknown as GenericId<"users">,
    action: args.action,
    targetType: args.target.type,
    targetId: args.target.id,
    result: args.result,
    payloadJson: args.payload === undefined ? undefined : JSON.stringify(args.payload),
    createdAt: args.now ?? Date.now(),
  });
}

const DEFAULT_IMPERSONATION_SESSION_MS = 60 * 60 * 1000;
const MAX_IMPERSONATION_SESSION_MS = 24 * 60 * 60 * 1000;

export function getImpersonationSessionDuration(): number {
  const raw = process.env.IMPERSONATION_SESSION_DURATION_MS;
  if (raw === undefined || raw === "") {
    return DEFAULT_IMPERSONATION_SESSION_MS;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("IMPERSONATION_SESSION_DURATION_MS must be a positive number of milliseconds");
  }
  if (value > MAX_IMPERSONATION_SESSION_MS) {
    throw new Error("IMPERSONATION_SESSION_DURATION_MS must not exceed 24 hours");
  }
  return value;
}
