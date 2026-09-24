import { paginator } from "convex-helpers/server/pagination";
import { query, mutation } from "../_generated/server.js";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel.js";
import {
  createAdminAudit,
  isUserBanned,
  requireSuperAdmin,
} from "../../convex-runtime/admin/admin.js";
import { hashPassword } from "../../convex-runtime/native/password.js";
import schema from "../schema.js";

const MAX_PAGE_LIMIT = 100;

type AdminUserListItem = Pick<
  Doc<"users">,
  | "_id"
  | "email"
  | "name"
  | "image"
  | "isActive"
  | "isSuperAdmin"
  | "roles"
  | "bannedUntil"
  | "banReason"
  | "createdAt"
>;

const adminUserValidator = v.object({
  _id: v.id("users"),
  email: v.optional(v.string()),
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  isActive: v.boolean(),
  isSuperAdmin: v.optional(v.boolean()),
  roles: v.optional(v.array(v.string())),
  bannedUntil: v.optional(v.number()),
  banReason: v.optional(v.string()),
  createdAt: v.number(),
});

function toAdminUserListItem(user: Doc<"users">): AdminUserListItem {
  return {
    _id: user._id,
    email: user.email,
    name: user.name,
    image: user.image,
    isActive: user.isActive,
    isSuperAdmin: user.isSuperAdmin,
    roles: user.roles,
    bannedUntil: user.bannedUntil,
    banReason: user.banReason,
    createdAt: user.createdAt,
  };
}

function matchesUserFilters(
  user: Doc<"users">,
  filters: {
    isActive?: boolean;
    isSuperAdmin?: boolean;
    banned?: boolean;
    search?: string;
  },
): boolean {
  if (filters.isActive !== undefined && user.isActive !== filters.isActive) {
    return false;
  }
  if (filters.isSuperAdmin !== undefined && (user.isSuperAdmin ?? false) !== filters.isSuperAdmin) {
    return false;
  }
  if (filters.banned !== undefined && isUserBanned(user) !== filters.banned) {
    return false;
  }
  if (filters.search !== undefined && filters.search !== "") {
    const term = filters.search.toLowerCase();
    const email = (user.email ?? "").toLowerCase();
    const name = (user.name ?? "").toLowerCase();
    if (!email.includes(term) && !name.includes(term)) {
      return false;
    }
  }
  return true;
}

export const listUsers = query({
  args: {
    search: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    isSuperAdmin: v.optional(v.boolean()),
    banned: v.optional(v.boolean()),
    sortBy: v.optional(v.union(v.literal("createdAt"), v.literal("email"), v.literal("name"))),
    sortDirection: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    users: v.array(adminUserValidator),
    nextCursor: v.optional(v.string()),
    hasNextPage: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ users: AdminUserListItem[]; nextCursor?: string; hasNextPage: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    await requireSuperAdmin(ctx, identity.subject);

    const limit = Math.min(args.limit ?? 20, MAX_PAGE_LIMIT);
    const sortBy = args.sortBy ?? "createdAt";
    const sortDirection = args.sortDirection ?? "desc";
    const rawSearch = args.search?.trim();
    const search = rawSearch?.toLowerCase();

    const filters = {
      isActive: args.isActive,
      isSuperAdmin: args.isSuperAdmin,
      banned: args.banned,
      search,
    };

    if (rawSearch !== undefined && rawSearch !== "") {
      const emailUser = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", rawSearch.toLowerCase()))
        .unique();
      const nameMatches = await ctx.db
        .query("users")
        .withIndex("by_name", (q) => q.eq("name", rawSearch))
        .take(MAX_PAGE_LIMIT);

      const seen = new Set<string>();
      const raw: Doc<"users">[] = [];
      if (emailUser !== null) {
        seen.add(String(emailUser._id));
        raw.push(emailUser);
      }
      for (const user of nameMatches) {
        if (!seen.has(String(user._id))) {
          seen.add(String(user._id));
          raw.push(user);
        }
      }

      const users = raw
        .filter((user) => matchesUserFilters(user, filters))
        .sort((a, b) => {
          const aValue = sortBy === "email" ? a.email : sortBy === "name" ? a.name : a.createdAt;
          const bValue = sortBy === "email" ? b.email : sortBy === "name" ? b.name : b.createdAt;
          const aStr = aValue ?? "";
          const bStr = bValue ?? "";
          return sortDirection === "asc"
            ? String(aStr).localeCompare(String(bStr))
            : String(bStr).localeCompare(String(aStr));
        })
        .slice(0, limit)
        .map(toAdminUserListItem);

      return { users, nextCursor: undefined, hasNextPage: false };
    }

    const base = paginator(ctx.db, schema).query("users");
    let q =
      sortBy === "email"
        ? base.withIndex("by_email").order(sortDirection)
        : sortBy === "name"
          ? base.withIndex("by_name").order(sortDirection)
          : base.order(sortDirection);

    const { page, continueCursor, isDone } = await q.paginate({
      cursor: args.cursor ?? null,
      numItems: limit,
    });

    const users = page.filter((user) => matchesUserFilters(user, filters)).map(toAdminUserListItem);

    return {
      users,
      nextCursor: continueCursor,
      hasNextPage: !isDone,
    };
  },
});

export const getUser = query({
  args: { userId: v.id("users") },
  returns: v.union(adminUserValidator, v.null()),
  handler: async (ctx, args): Promise<AdminUserListItem | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    await requireSuperAdmin(ctx, identity.subject);
    const user = await ctx.db.get("users", args.userId);
    if (user === null) {
      return null;
    }
    return {
      _id: user._id,
      email: user.email,
      name: user.name,
      image: user.image,
      isActive: user.isActive,
      isSuperAdmin: user.isSuperAdmin,
      roles: user.roles,
      bannedUntil: user.bannedUntil,
      banReason: user.banReason,
      createdAt: user.createdAt,
    };
  },
});

export const banUser = mutation({
  args: {
    userId: v.id("users"),
    bannedUntil: v.optional(v.number()),
    reason: v.optional(v.string()),
  },
  returns: v.object({ userId: v.id("users"), bannedUntil: v.optional(v.number()) }),
  handler: async (ctx, args): Promise<{ userId: Id<"users">; bannedUntil?: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const admin = await requireSuperAdmin(ctx, identity.subject);
    if (String(args.userId) === String(admin._id)) {
      throw new Error("Cannot ban yourself");
    }

    const now = Date.now();
    const target = await ctx.db.get("users", args.userId);
    if (target === null) {
      throw new Error("User not found");
    }

    await ctx.db.patch("users", args.userId, {
      bannedAt: now,
      bannedUntil: args.bannedUntil,
      banReason: args.reason,
      updatedAt: now,
    });

    await createAdminAudit(ctx, {
      adminId: String(admin._id),
      action: "banUser",
      target: { type: "user", id: String(args.userId) },
      result: "success",
      payload: {
        email: target.email,
        reason: args.reason,
        bannedUntil: args.bannedUntil,
      },
      now,
    });

    return { userId: args.userId, bannedUntil: args.bannedUntil };
  },
});

export const unbanUser = mutation({
  args: { userId: v.id("users") },
  returns: v.object({ userId: v.id("users") }),
  handler: async (ctx, args): Promise<{ userId: Id<"users"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const admin = await requireSuperAdmin(ctx, identity.subject);

    const target = await ctx.db.get("users", args.userId);
    if (target === null) {
      throw new Error("User not found");
    }

    const now = Date.now();
    await ctx.db.patch("users", args.userId, {
      bannedAt: undefined,
      bannedUntil: undefined,
      banReason: undefined,
      updatedAt: now,
    });

    await createAdminAudit(ctx, {
      adminId: String(admin._id),
      action: "unbanUser",
      target: { type: "user", id: String(args.userId) },
      result: "success",
      payload: { email: target.email },
      now,
    });

    return { userId: args.userId };
  },
});

export const claimSuperAdmin = mutation({
  args: {},
  returns: v.object({ userId: v.id("users") }),
  handler: async (ctx): Promise<{ userId: Id<"users"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get("users", identity.subject as Id<"users">);
    if (user === null) {
      throw new Error("User not found");
    }

    const now = Date.now();
    if (
      user.isAnonymous ||
      !user.isActive ||
      (user.bannedUntil !== undefined && user.bannedUntil > now)
    ) {
      throw new Error("User is not eligible to claim super admin");
    }

    if (user.isSuperAdmin) {
      return { userId: user._id };
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_super_admin", (q) => q.eq("isSuperAdmin", true))
      .take(1);
    if (existing.length > 0) {
      throw new Error("A super admin already exists");
    }

    await ctx.db.patch("users", user._id, {
      isSuperAdmin: true,
      roles: ["admin"],
      updatedAt: now,
    });

    await createAdminAudit(ctx, {
      adminId: String(user._id),
      action: "claimSuperAdmin",
      target: { type: "user", id: String(user._id) },
      result: "success",
      payload: { email: user.email },
      now,
    });

    return { userId: user._id };
  },
});

export const removeUser = mutation({
  args: { userId: v.id("users"), reason: v.optional(v.string()) },
  returns: v.object({ deleted: v.boolean(), userId: v.id("users") }),
  handler: async (ctx, args): Promise<{ deleted: boolean; userId: Id<"users"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const admin = await requireSuperAdmin(ctx, identity.subject);
    if (String(args.userId) === String(admin._id)) {
      throw new Error("Cannot remove yourself");
    }

    const target = await ctx.db.get("users", args.userId);
    if (target === null) {
      throw new Error("User not found");
    }

    for await (const identity of ctx.db
      .query("auth_identities")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))) {
      await ctx.db.delete("auth_identities", identity._id);
    }

    for await (const account of ctx.db
      .query("authAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))) {
      await ctx.db.delete("authAccounts", account._id);
    }

    for await (const session of ctx.db
      .query("authSessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))) {
      await ctx.db.delete("authSessions", session._id);
    }

    for await (const token of ctx.db
      .query("authRefreshTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))) {
      await ctx.db.delete("authRefreshTokens", token._id);
    }

    for await (const code of ctx.db
      .query("authVerificationCodes")
      .withIndex("by_user_type", (q) => q.eq("userId", args.userId))) {
      await ctx.db.delete("authVerificationCodes", code._id);
    }

    await ctx.db.delete("users", args.userId);

    const now = Date.now();
    await createAdminAudit(ctx, {
      adminId: String(admin._id),
      action: "removeUser",
      target: { type: "user", id: String(args.userId) },
      result: "success",
      payload: { email: target.email, reason: args.reason },
      now,
    });

    return { deleted: true, userId: args.userId };
  },
});

function normalizeAdminEmail(email: string): string | undefined {
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function isAdminRole(roles: string[]): boolean {
  return roles.includes("admin");
}

export const createUser = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.string(),
    image: v.optional(v.string()),
    role: v.optional(v.union(v.string(), v.array(v.string()))),
    emailVerified: v.optional(v.boolean()),
  },
  returns: adminUserValidator,
  handler: async (ctx, args): Promise<AdminUserListItem> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const admin = await requireSuperAdmin(ctx, identity.subject);

    const normalizedEmail = normalizeAdminEmail(args.email);
    if (!normalizedEmail) {
      throw new Error("Invalid email");
    }
    if (args.password.length < 6 || args.password.length > 128) {
      throw new Error("Password must be between 6 and 128 characters");
    }

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .unique();
    if (existingUser !== null) {
      throw new Error("User already exists");
    }

    const roles =
      args.role === undefined ? undefined : typeof args.role === "string" ? [args.role] : args.role;
    const isSuperAdmin = roles !== undefined && isAdminRole(roles);

    const credentialHash = await hashPassword(args.password);
    const now = Date.now();
    const subject = crypto.randomUUID();

    const userId = await ctx.db.insert("users", {
      email: normalizedEmail,
      name: args.name,
      image: args.image,
      emailVerified: args.emailVerified ?? true,
      isActive: true,
      isSuperAdmin,
      roles,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auth_identities", {
      identityId: subject,
      userId,
      provider: "password",
      issuer: "native",
      subject,
      tokenIdentifier: subject,
      email: normalizedEmail,
      emailVerified: args.emailVerified ?? true,
      sessionId: null,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("authAccounts", {
      userId,
      provider: "password",
      issuer: "native",
      subject,
      credentialHash,
      createdAt: now,
      updatedAt: now,
    });

    await createAdminAudit(ctx, {
      adminId: String(admin._id),
      action: "createUser",
      target: { type: "user", id: String(userId) },
      result: "success",
      payload: { email: normalizedEmail, roles },
      now,
    });

    const userRecord = await ctx.db.get("users", userId);
    if (userRecord === null) {
      throw new Error("User not found after creation");
    }
    return {
      _id: userRecord._id,
      email: userRecord.email,
      name: userRecord.name,
      image: userRecord.image,
      isActive: userRecord.isActive,
      isSuperAdmin: userRecord.isSuperAdmin,
      roles: userRecord.roles,
      bannedUntil: userRecord.bannedUntil,
      banReason: userRecord.banReason,
      createdAt: userRecord.createdAt,
    };
  },
});

export const setRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.string(), v.array(v.string())),
  },
  returns: adminUserValidator,
  handler: async (ctx, args): Promise<AdminUserListItem> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const admin = await requireSuperAdmin(ctx, identity.subject);
    if (String(args.userId) === String(admin._id)) {
      throw new Error("Cannot change your own role");
    }

    const target = await ctx.db.get("users", args.userId);
    if (target === null) {
      throw new Error("User not found");
    }

    const roles = typeof args.role === "string" ? [args.role] : args.role;
    const now = Date.now();
    await ctx.db.patch("users", args.userId, {
      roles,
      isSuperAdmin: isAdminRole(roles),
      updatedAt: now,
    });

    await createAdminAudit(ctx, {
      adminId: String(admin._id),
      action: "setRole",
      target: { type: "user", id: String(args.userId) },
      result: "success",
      payload: { email: target.email, roles },
      now,
    });

    const userRecord = await ctx.db.get("users", args.userId);
    if (userRecord === null) {
      throw new Error("User not found");
    }
    return {
      _id: userRecord._id,
      email: userRecord.email,
      name: userRecord.name,
      image: userRecord.image,
      isActive: userRecord.isActive,
      isSuperAdmin: userRecord.isSuperAdmin,
      roles: userRecord.roles,
      bannedUntil: userRecord.bannedUntil,
      banReason: userRecord.banReason,
      createdAt: userRecord.createdAt,
    };
  },
});

export const setUserPassword = mutation({
  args: {
    userId: v.id("users"),
    password: v.string(),
  },
  returns: v.object({ userId: v.id("users") }),
  handler: async (ctx, args): Promise<{ userId: Id<"users"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const admin = await requireSuperAdmin(ctx, identity.subject);

    const target = await ctx.db.get("users", args.userId);
    if (target === null) {
      throw new Error("User not found");
    }
    if (args.password.length < 6 || args.password.length > 128) {
      throw new Error("Password must be between 6 and 128 characters");
    }

    const credentialHash = await hashPassword(args.password);
    const now = Date.now();
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("by_user_provider_issuer", (q) =>
        q.eq("userId", args.userId).eq("provider", "password").eq("issuer", "native"),
      )
      .take(1);
    const existing = accounts[0];

    if (existing === undefined) {
      const subject = crypto.randomUUID();
      await ctx.db.insert("auth_identities", {
        identityId: subject,
        userId: args.userId,
        provider: "password",
        issuer: "native",
        subject,
        tokenIdentifier: subject,
        email: target.email,
        emailVerified: target.emailVerified,
        sessionId: null,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("authAccounts", {
        userId: args.userId,
        provider: "password",
        issuer: "native",
        subject,
        credentialHash,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      const identityRecords = await ctx.db
        .query("auth_identities")
        .withIndex("by_user_provider_issuer", (q) =>
          q.eq("userId", args.userId).eq("provider", "password").eq("issuer", "native"),
        )
        .take(1);
      const identityRecord = identityRecords[0];
      if (identityRecord !== undefined) {
        await ctx.db.patch("auth_identities", identityRecord._id, { updatedAt: now });
      }
      await ctx.db.patch("authAccounts", existing._id, { credentialHash, updatedAt: now });
    }

    await createAdminAudit(ctx, {
      adminId: String(admin._id),
      action: "setUserPassword",
      target: { type: "user", id: String(args.userId) },
      result: "success",
      payload: { email: target.email },
      now,
    });

    return { userId: args.userId };
  },
});
