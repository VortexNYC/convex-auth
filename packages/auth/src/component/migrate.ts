import { v } from "convex/values";
import { createFunctionHandle, makeFunctionReference } from "convex/server";
import { internalMutation, internalQuery } from "./_generated/server.js";
import { DEFAULT_SEED_ROLE_CATALOG } from "./organizations.js";

const legacyUserValidator = v.object({
  _id: v.optional(v.string()),
  name: v.string(),
  email: v.string(),
  emailVerified: v.boolean(),
  image: v.optional(v.union(v.null(), v.string())),
  createdAt: v.number(),
  updatedAt: v.number(),
  twoFactorEnabled: v.optional(v.union(v.null(), v.boolean())),
  isAnonymous: v.optional(v.union(v.null(), v.boolean())),
  username: v.optional(v.union(v.null(), v.string())),
  displayUsername: v.optional(v.union(v.null(), v.string())),
  phoneNumber: v.optional(v.union(v.null(), v.string())),
  phoneNumberVerified: v.optional(v.union(v.null(), v.boolean())),
  userId: v.optional(v.union(v.null(), v.string())),
});

const legacyAccountValidator = v.object({
  _id: v.optional(v.string()),
  issuer: v.optional(v.union(v.null(), v.string())),
  accountId: v.string(),
  providerId: v.string(),
  userId: v.string(),
  accessToken: v.optional(v.union(v.null(), v.string())),
  refreshToken: v.optional(v.union(v.null(), v.string())),
  idToken: v.optional(v.union(v.null(), v.string())),
  accessTokenExpiresAt: v.optional(v.union(v.null(), v.number())),
  refreshTokenExpiresAt: v.optional(v.union(v.null(), v.number())),
  scope: v.optional(v.union(v.null(), v.string())),
  password: v.optional(v.union(v.null(), v.string())),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const legacySessionValidator = v.object({
  _id: v.optional(v.string()),
  expiresAt: v.number(),
  token: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  ipAddress: v.optional(v.union(v.null(), v.string())),
  userAgent: v.optional(v.union(v.null(), v.string())),
  userId: v.string(),
});

function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

function providerFromLegacy(providerId: string) {
  return providerId === "credential" ? "password" : providerId;
}

function issuerFromLegacy(provider: string, legacyIssuer?: string | null) {
  if (provider === "password") return "native";
  return legacyIssuer ?? `${provider}`;
}

/**
 * Migrate a single Better Auth user into the native `users` table.
 * Idempotent: returns the existing user if the email is already present.
 * Two-factor secrets are not migrated; users re-enroll after signing in.
 */
export const migrateUser = internalMutation({
  args: { legacyUser: legacyUserValidator },
  returns: v.object({ userId: v.id("users") }),
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.legacyUser.email);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) {
      return { userId: existing._id };
    }

    const userId = await ctx.db.insert("users", {
      email,
      name: args.legacyUser.name,
      image: args.legacyUser.image ?? undefined,
      emailVerified: args.legacyUser.emailVerified,
      isActive: true,
      createdAt: args.legacyUser.createdAt,
      updatedAt: args.legacyUser.updatedAt,
    });

    return { userId };
  },
});

/**
 * Migrate a single Better Auth account into native `auth_identities` and
 * `authAccounts`.
 */
export const migrateAccount = internalMutation({
  args: {
    legacyAccount: legacyAccountValidator,
    userId: v.id("users"),
    email: v.optional(v.string()),
    emailVerified: v.optional(v.boolean()),
  },
  returns: v.object({ identityId: v.id("auth_identities") }),
  handler: async (ctx, args) => {
    const provider = providerFromLegacy(args.legacyAccount.providerId);
    const issuer = issuerFromLegacy(provider, args.legacyAccount.issuer);
    const subject = provider === "password" ? args.userId : args.legacyAccount.accountId;
    const tokenIdentifier = provider === "password" ? subject : `${issuer}|${subject}`;

    const existing = await ctx.db
      .query("auth_identities")
      .withIndex("by_token_identifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();
    if (existing) {
      return { identityId: existing._id };
    }

    const identityId = await ctx.db.insert("auth_identities", {
      identityId: tokenIdentifier,
      userId: args.userId,
      provider,
      issuer,
      subject,
      tokenIdentifier,
      email: args.email ? normalizeEmail(args.email) : undefined,
      emailVerified: args.emailVerified ?? false,
      sessionId: undefined,
      createdAt: args.legacyAccount.createdAt,
      updatedAt: args.legacyAccount.updatedAt,
    });

    await ctx.db.insert("authAccounts", {
      userId: args.userId,
      provider,
      issuer,
      subject,
      credentialHash: args.legacyAccount.password ?? "",
      accessToken: args.legacyAccount.accessToken ?? undefined,
      refreshToken: args.legacyAccount.refreshToken ?? undefined,
      idToken: args.legacyAccount.idToken ?? undefined,
      tokenType: undefined,
      scopes: args.legacyAccount.scope ? [args.legacyAccount.scope] : undefined,
      accessTokenExpiresAt: args.legacyAccount.accessTokenExpiresAt ?? undefined,
      refreshTokenExpiresAt: args.legacyAccount.refreshTokenExpiresAt ?? undefined,
      createdAt: args.legacyAccount.createdAt,
      updatedAt: args.legacyAccount.updatedAt,
    });

    return { identityId };
  },
});

/**
 * Migrate a single Better Auth session into native `authSessions`.
 */
export const migrateSession = internalMutation({
  args: {
    legacySession: legacySessionValidator,
    userId: v.id("users"),
  },
  returns: v.object({ sessionId: v.id("authSessions") }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("authSessions")
      .withIndex("by_token", (q) => q.eq("token", args.legacySession.token))
      .unique();
    if (existing) {
      return { sessionId: existing._id };
    }

    const sessionId = await ctx.db.insert("authSessions", {
      sessionId: args.legacySession.token,
      userId: args.userId,
      token: args.legacySession.token,
      familyId: args.legacySession.token,
      expiresAt: args.legacySession.expiresAt,
      ipAddress: args.legacySession.ipAddress ?? undefined,
      userAgent: args.legacySession.userAgent ?? undefined,
      revokedAt: undefined,
      createdAt: args.legacySession.createdAt,
      updatedAt: args.legacySession.updatedAt,
    });

    return { sessionId };
  },
});

const migratedOrganizationValidator = v.object({
  externalId: v.optional(v.string()),
  name: v.string(),
  slug: v.string(),
  imageUrl: v.optional(v.union(v.null(), v.string())),
  createdAt: v.number(),
  updatedAt: v.number(),
});

/**
 * Migrate a single organization from an external provider (Clerk, WorkOS).
 * Idempotent on `slug`. Seeds the default owner/member role catalog so
 * `migrateMembership` has resolvable roles. Lifecycle webhook events are
 * intentionally not emitted — bulk imports must not flood subscribers.
 */
export const migrateOrganization = internalMutation({
  args: { organization: migratedOrganizationValidator },
  returns: v.object({ organizationId: v.id("organizations"), created: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.organization.slug))
      .unique();
    if (existing) {
      return { organizationId: existing._id, created: false };
    }

    const organizationId = await ctx.db.insert("organizations", {
      name: args.organization.name,
      slug: args.organization.slug,
      imageUrl: args.organization.imageUrl ?? undefined,
      status: "active",
      /* The `migration` marker distinguishes imported orgs from pre-existing
       * tenants — `migrateMembership` refuses to attach members to an org that
       * lacks it unless the caller explicitly opts in. */
      metadataJson: JSON.stringify({
        migration: { externalId: args.organization.externalId ?? null },
      }),
      createdAt: args.organization.createdAt,
      updatedAt: args.organization.updatedAt,
    });

    for (const role of DEFAULT_SEED_ROLE_CATALOG) {
      await ctx.db.insert("organization_roles", {
        organizationId,
        key: role.key,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        isSystem: role.isSystem,
        createdAt: args.organization.createdAt,
        updatedAt: args.organization.updatedAt,
      });
    }

    return { organizationId, created: true };
  },
});

function hasMigrationMarker(doc: { metadataJson?: string }): boolean {
  if (!doc.metadataJson) return false;
  try {
    const parsed: unknown = JSON.parse(doc.metadataJson);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      "migration" in (parsed as Record<string, unknown>)
    );
  } catch {
    return false;
  }
}

/**
 * Migrate a single org membership. Idempotent on (user, organization) for
 * known users and on (organization, invitedEmail) for users not yet
 * migrated — those land as `invited` so the seat exists when they sign up.
 * An invited row for the same email is promoted to active rather than
 * duplicated when the user appears. Missing roles are created with
 * `rolePermissions` (default: `["*"]` only for `owner`, the read-only member
 * set for `member`, empty for everything else — an export must never mint
 * privileged roles silently; `roleCreated` is reported for review).
 *
 * Memberships refuse to attach to organizations that were not created by
 * `migrateOrganization` (no `migration` marker in metadataJson) unless the
 * caller passes `allowExistingOrg` — otherwise a hostile or colliding export
 * could pour members into a pre-existing tenant.
 */
export const migrateMembership = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    email: v.string(),
    roleKey: v.optional(v.string()),
    roleName: v.optional(v.string()),
    rolePermissions: v.optional(v.array(v.string())),
    allowExistingOrg: v.optional(v.boolean()),
    /* "invited" forces the invited-email row even when the user already
     * exists — e.g. a WorkOS membership that was never accepted. */
    status: v.optional(v.union(v.literal("active"), v.literal("invited"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({
    memberId: v.optional(v.id("organization_members")),
    roleId: v.optional(v.id("organization_roles")),
    roleCreated: v.boolean(),
    userFound: v.boolean(),
    skipped: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const organization = await ctx.db.get("organizations", args.organizationId);
    if (!organization) {
      return { roleCreated: false, userFound: false, skipped: "organization not found" };
    }
    if (!hasMigrationMarker(organization) && args.allowExistingOrg !== true) {
      return {
        roleCreated: false,
        userFound: false,
        skipped: "organization lacks migration marker — pass allowExistingOrg to attach",
      };
    }

    const email = normalizeEmail(args.email);
    const roleKey = args.roleKey ?? "member";

    let role = await ctx.db
      .query("organization_roles")
      .withIndex("by_organization_key", (q) =>
        q.eq("organizationId", args.organizationId).eq("key", roleKey),
      )
      .unique();
    let roleCreated = false;
    if (role === null) {
      const roleId = await ctx.db.insert("organization_roles", {
        organizationId: args.organizationId,
        key: roleKey,
        name: args.roleName ?? roleKey,
        permissions:
          args.rolePermissions ??
          (roleKey === "owner"
            ? ["*"]
            : roleKey === "member"
              ? ["organization:read", "organization:members:read"]
              : []),
        isSystem: false,
        createdAt: args.createdAt,
        updatedAt: args.updatedAt,
      });
      role = (await ctx.db.get("organization_roles", roleId))!;
      roleCreated = true;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (user && args.status !== "invited") {
      const existing = await ctx.db
        .query("organization_members")
        .withIndex("by_user_organization", (q) =>
          q.eq("userId", user._id).eq("organizationId", args.organizationId),
        )
        .unique();
      if (existing) {
        return {
          memberId: existing._id,
          roleId: existing.roleId,
          roleCreated,
          userFound: true,
        };
      }
      /* Promote an earlier invited row instead of inserting a sibling. */
      const invited = await ctx.db
        .query("organization_members")
        .withIndex("by_organization_invited_email", (q) =>
          q.eq("organizationId", args.organizationId).eq("invitedEmail", email),
        )
        .unique();
      if (invited) {
        await ctx.db.patch("organization_members", invited._id, {
          userId: user._id,
          roleId: role._id,
          status: "active",
          invitedEmail: undefined,
          acceptedAt: args.createdAt,
          updatedAt: args.updatedAt,
        });
        return { memberId: invited._id, roleId: role._id, roleCreated, userFound: true };
      }
      const memberId = await ctx.db.insert("organization_members", {
        organizationId: args.organizationId,
        userId: user._id,
        roleId: role._id,
        status: "active",
        acceptedAt: args.createdAt,
        createdAt: args.createdAt,
        updatedAt: args.updatedAt,
      });
      return { memberId, roleId: role._id, roleCreated, userFound: true };
    }

    const existingInvite = await ctx.db
      .query("organization_members")
      .withIndex("by_organization_invited_email", (q) =>
        q.eq("organizationId", args.organizationId).eq("invitedEmail", email),
      )
      .unique();
    if (existingInvite) {
      return {
        memberId: existingInvite._id,
        roleId: existingInvite.roleId,
        roleCreated,
        userFound: false,
      };
    }
    const memberId = await ctx.db.insert("organization_members", {
      organizationId: args.organizationId,
      roleId: role._id,
      status: "invited",
      invitedEmail: email,
      invitedAt: args.createdAt,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
    });
    return { memberId, roleId: role._id, roleCreated, userFound: false };
  },
});

const migrationHandlesValidator = v.object({
  migrateUser: v.string(),
  migrateAccount: v.string(),
  migrateSession: v.string(),
  migrateOrganization: v.string(),
  migrateMembership: v.string(),
});

/**
 * Return function handles for the migration writer mutations so an external
 * CLI can wire the vendored adapter's migrateAll runner to convex-auth.
 */
export const getMigrationFunctionHandles = internalQuery({
  args: {},
  returns: migrationHandlesValidator,
  handler: async () => {
    const [migrateUser, migrateAccount, migrateSession, migrateOrganization, migrateMembership] =
      await Promise.all([
        createFunctionHandle(makeFunctionReference<"mutation">("migrate:migrateUser")),
        createFunctionHandle(makeFunctionReference<"mutation">("migrate:migrateAccount")),
        createFunctionHandle(makeFunctionReference<"mutation">("migrate:migrateSession")),
        createFunctionHandle(makeFunctionReference<"mutation">("migrate:migrateOrganization")),
        createFunctionHandle(makeFunctionReference<"mutation">("migrate:migrateMembership")),
      ]);
    return {
      migrateUser,
      migrateAccount,
      migrateSession,
      migrateOrganization,
      migrateMembership,
    };
  },
});
