/**
 * Canonical adapter glue for convex-auth consumers.
 *
 * One factory. Two modes (`orgs: "enabled" | "disabled"`). Same idempotent
 * provisioning + self-heal semantics across every consumer. Consumers wire
 * this once in their `convex/auth.ts` and call `auth.resolveViewer(ctx)`
 * everywhere — no more bespoke `lib/identity.ts` per repo.
 *
 * Design constraints baked in (Codex-validated against the prior
 * legacy × Convex integration mistakes):
 *
 *  1. Adapter pattern, NOT consumer-table reads from the package. The glue
 *     never knows table or index names; consumer injects callbacks.
 *  2. Idempotent bootstrap + self-heal. legacy >=1.7.0 runs
 *     `databaseHooks.user.create.after` post-commit, so the user can be
 *     persisted while bootstrap throws. Self-heal on first authenticated
 *     resolution covers that gap.
 *  3. One round-trip per request. `resolveViewer` resolves identity +
 *     local user + active org + membership + permissions once and caches
 *     them on the returned viewer object. Stacked `require*` calls are
 *     synchronous against the cached state.
 *  4. Active-org is a HINT. `user.activeConvexAuthOrganizationId` is
 *     validated against live membership every resolve. Never trusted blind.
 *  5. Permission override is an explicit `{add, remove}` merge contract, not
 *     a raw array replacement.
 *  6. Component ids are opaque strings — never branded as consumer Convex
 *     ids (the platform owns them; see better-auth/convex GH issue #372).
 */

import { hasPermission } from "../../compat/permissions";
import { ConvexError } from "convex/values";

import type { Id } from "../../component/_generated/dataModel";
import { throwAuthError } from "./throwAuthError";
import type {
  B2BGlue,
  B2BModeAdapters,
  B2BModeConfig,
  B2BViewer,
  ConsumerGlue,
  ConsumerModeConfig,
  ConsumerViewer,
  Glue,
  GlueAnchorMinimum,
  GlueConfig,
  GlueCtx,
  GlueUserMinimum,
  ResolvedMembership,
  ConvexAuthComponentHandle,
} from "./types";

const DEFAULT_IDENTITY_PROVIDER = "convex-auth";

type ComponentIdTable = "organization_members" | "organizations" | "users";

/**
 * Consumer schemas store component ids as opaque strings because component
 * tables do not exist in the consumer's data model. Component functions
 * validate these values with `v.id()` at runtime, so this single boundary
 * conversion restores the component-local brand before an internal call.
 */
function isComponentId<Table extends ComponentIdTable>(_table: Table, id: string): id is Id<Table> {
  return id.length > 0;
}

function toComponentId<Table extends ComponentIdTable>(table: Table, id: string): Id<Table> {
  if (!isComponentId(table, id)) {
    throw new TypeError(`convex-auth glue: empty component ${table} id`);
  }
  return id;
}

/**
 * A component id has no consumer-side table identity. Mounted component APIs
 * expose ids as opaque strings, so normalize both mounted and component-local
 * ids to that exported representation.
 */
function toConsumerId(id: string): string {
  return id;
}

// Factory overloads so the returned glue is precisely typed per mode.
export function createConvexAuthGlue<TUser extends GlueUserMinimum>(
  config: ConsumerModeConfig<TUser>,
): ConsumerGlue<TUser>;
export function createConvexAuthGlue<
  TUser extends GlueUserMinimum,
  TAnchor extends GlueAnchorMinimum,
>(config: B2BModeConfig<TUser, TAnchor>): B2BGlue<TUser, TAnchor>;
export function createConvexAuthGlue<
  TUser extends GlueUserMinimum,
  TAnchor extends GlueAnchorMinimum,
>(config: GlueConfig<TUser, TAnchor>): Glue<TUser, TAnchor> {
  if (config.orgs === "disabled") {
    return createConsumerGlue(config);
  }
  return createB2BGlue(config);
}

// ---------------------------------------------------------------------------
// Consumer mode (orgs: disabled) — single-user-per-account flows. No
// anchor, no membership, no per-org permissions.
//
// Mode selection is fail-safe by construction: `orgs` is a typed
// `"enabled" | "disabled"` literal and the factory defaults every non-"disabled"
// value to B2B (RBAC enforced), so consumer mode is reachable ONLY by explicitly
// writing `orgs: "disabled"` — never by a typo or omission. The remaining risk is
// that turning RBAC OFF is silent, so we announce it loudly (once per process):
// any app that meant to enforce permissions will see this in its logs.
// ---------------------------------------------------------------------------

let consumerModeRbacDisabledWarned = false;

function warnConsumerModeRbacDisabledOnce(): void {
  if (consumerModeRbacDisabledWarned) {
    return;
  }
  consumerModeRbacDisabledWarned = true;
  console.warn(
    '[convex-auth] createConvexAuthGlue: orgs="disabled" (consumer mode) — ' +
      "RBAC is OFF. hasPermission() is always true and requirePermission() is a " +
      "no-op for every authenticated user. If this app needs permission gating " +
      '(any multi-tenant / fintech consumer), use orgs: "enabled" (B2B mode).',
  );
}

function createConsumerGlue<TUser extends GlueUserMinimum>(
  config: ConsumerModeConfig<TUser>,
): ConsumerGlue<TUser> {
  warnConsumerModeRbacDisabledOnce();
  return {
    mode: "consumer",
    resolveViewer: async (ctx) => {
      const identity = await ctx.auth.getUserIdentity();
      if (identity === null) {
        throwAuthError("UNAUTHORIZED", "AUTHENTICATION_REQUIRED");
      }
      const convexAuthUserId = await resolveComponentUserId(
        ctx,
        config.component,
        identity.subject,
        identity.issuer,
        config.identityProvider ?? DEFAULT_IDENTITY_PROVIDER,
      );
      if (convexAuthUserId === null) {
        throwAuthError("UNAUTHORIZED", "USER_MISSING", "Component user not found for identity");
      }
      const user = await config.adapters.findUserByConvexAuthUserId(
        ctx,
        toConsumerId(convexAuthUserId),
      );
      if (user === null) {
        throwAuthError(
          "UNAUTHORIZED",
          "USER_MISSING",
          "Local user row not found for the authenticated identity",
        );
      }
      const viewer: ConsumerViewer<TUser> = {
        mode: "consumer",
        identity: {
          subject: identity.subject,
          issuer: identity.issuer,
          ...(typeof identity.tokenIdentifier === "string"
            ? { tokenIdentifier: identity.tokenIdentifier }
            : {}),
        },
        user,
        convexAuthUserId: toConsumerId(convexAuthUserId),
        hasPermission: () => true,
        requirePermission: () => {
          // In consumer mode there is no permission model — every authenticated
          // user is allowed. Consumers needing global RBAC should run in b2b
          // mode with a singleton "platform" org, or fork this in their app.
        },
      };
      return viewer;
    },
    bootstrapNewUser: async () => {
      // Nothing to bootstrap in consumer mode: the user mirror is created by
      // the legacy adapter pre-commit; the glue has no other state to
      // attach. Keep the method on the surface so the wiring shape is
      // identical between modes (forward-compat: if a consumer switches to
      // b2b later, only the config changes, not the call sites).
    },
  };
}

// ---------------------------------------------------------------------------
// B2B mode (orgs: enabled) — anchor, membership, role-based permissions,
// active-org hint + validation, idempotent bootstrap + self-heal.
// ---------------------------------------------------------------------------

function createB2BGlue<TUser extends GlueUserMinimum, TAnchor extends GlueAnchorMinimum>(
  config: B2BModeConfig<TUser, TAnchor>,
): B2BGlue<TUser, TAnchor> {
  const invitedUsersGetPersonalOrg = config.invitedUsersGetPersonalOrg ?? false;
  const identityProvider = config.identityProvider ?? DEFAULT_IDENTITY_PROVIDER;

  const resolveViewer = async (ctx: GlueCtx): Promise<B2BViewer<TUser, TAnchor>> =>
    resolveB2BViewer({
      ctx,
      config,
      invitedUsersGetPersonalOrg,
      identityProvider,
    });

  return {
    mode: "b2b",
    resolveViewer,
    bootstrapNewUser: async (ctx, args) => {
      // Idempotent: safe to call multiple times. The helper itself checks
      // for existing memberships before creating a personal org.
      await bootstrapMembership({
        ctx,
        config,
        invitedUsersGetPersonalOrg,
        identityProvider,
        convexAuthUserId: toComponentId("users", args.convexAuthUserId),
        email: args.email,
        name: args.name,
      });
    },
  };
}

async function resolveB2BViewer<TUser extends GlueUserMinimum, TAnchor extends GlueAnchorMinimum>({
  config,
  ctx,
  identityProvider,
  invitedUsersGetPersonalOrg,
}: {
  config: B2BModeConfig<TUser, TAnchor>;
  ctx: GlueCtx;
  identityProvider: string;
  invitedUsersGetPersonalOrg: boolean;
}): Promise<B2BViewer<TUser, TAnchor>> {
  const identity = await requireGlueIdentity(ctx);
  const convexAuthUserId = await resolveComponentUserId(
    ctx,
    config.component,
    identity.subject,
    identity.issuer,
    identityProvider,
  );
  if (convexAuthUserId === null) {
    throwAuthError("UNAUTHORIZED", "USER_MISSING", "Component user not found for identity");
  }
  const user = await requireLocalGlueUser(ctx, config, convexAuthUserId);
  const resolved = await resolveViewerMembership({
    config,
    ctx,
    identity,
    identityProvider,
    invitedUsersGetPersonalOrg,
    user,
    convexAuthUserId,
  });
  const anchor = await requireViewerAnchor(ctx, config, resolved.convexAuthOrganizationId);

  return buildB2BViewer({
    anchor,
    identity,
    membership: resolved.membership,
    user: resolved.user,
    convexAuthOrganizationId: resolved.convexAuthOrganizationId,
    convexAuthUserId,
  });
}

async function requireGlueIdentity(ctx: GlueCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throwAuthError("UNAUTHORIZED", "AUTHENTICATION_REQUIRED");
  }
  return identity;
}

async function requireLocalGlueUser<
  TUser extends GlueUserMinimum,
  TAnchor extends GlueAnchorMinimum,
>(
  ctx: GlueCtx,
  config: B2BModeConfig<TUser, TAnchor>,
  convexAuthUserId: Id<"users">,
): Promise<TUser> {
  const user = await config.adapters.findUserByConvexAuthUserId(
    ctx,
    toConsumerId(convexAuthUserId),
  );
  if (user === null) {
    throwAuthError(
      "UNAUTHORIZED",
      "USER_MISSING",
      "Local user row not found for the authenticated identity",
    );
  }
  return user;
}

async function resolveViewerMembership<
  TUser extends GlueUserMinimum,
  TAnchor extends GlueAnchorMinimum,
>({
  config,
  ctx,
  identity,
  identityProvider,
  invitedUsersGetPersonalOrg,
  user,
  convexAuthUserId,
}: {
  config: B2BModeConfig<TUser, TAnchor>;
  ctx: GlueCtx;
  identity: Awaited<ReturnType<GlueCtx["auth"]["getUserIdentity"]>>;
  identityProvider: string;
  invitedUsersGetPersonalOrg: boolean;
  user: TUser;
  convexAuthUserId: Id<"users">;
}): Promise<{
  user: TUser;
  convexAuthOrganizationId: Id<"organizations">;
  membership: ResolvedMembership;
}> {
  const activeOrgId = user.activeConvexAuthOrganizationId;
  if (typeof activeOrgId === "string") {
    const componentOrganizationId = toComponentId("organizations", activeOrgId);
    const membership = await fetchMembership(
      ctx,
      config.component,
      config.adapters,
      componentOrganizationId,
      convexAuthUserId,
    );
    if (membership !== null) {
      return {
        user,
        convexAuthOrganizationId: componentOrganizationId,
        membership,
      };
    }
  }

  const healed = await selfHeal({
    ctx,
    config,
    invitedUsersGetPersonalOrg,
    identityProvider,
    user,
    convexAuthUserId,
    email: typeof identity?.email === "string" ? identity.email : undefined,
    name: typeof identity?.name === "string" ? identity.name : undefined,
  });
  if (healed === null) {
    throwAuthError("FORBIDDEN", "MEMBERSHIP_MISSING", "User has no active organization membership");
  }
  return healed;
}

async function requireViewerAnchor<
  TUser extends GlueUserMinimum,
  TAnchor extends GlueAnchorMinimum,
>(
  ctx: GlueCtx,
  config: B2BModeConfig<TUser, TAnchor>,
  convexAuthOrganizationId: Id<"organizations">,
): Promise<TAnchor> {
  const anchor = await config.adapters.findAnchorByConvexAuthOrganizationId(
    ctx,
    toConsumerId(convexAuthOrganizationId),
  );
  if (anchor === null) {
    throwAuthError(
      "NOT_FOUND",
      "ANCHOR_MISSING",
      "Local organization anchor missing for the active organization",
    );
  }
  return anchor;
}

function buildB2BViewer<TUser extends GlueUserMinimum, TAnchor extends GlueAnchorMinimum>({
  anchor,
  identity,
  membership,
  user,
  convexAuthOrganizationId,
  convexAuthUserId,
}: {
  anchor: TAnchor;
  identity: NonNullable<Awaited<ReturnType<GlueCtx["auth"]["getUserIdentity"]>>>;
  membership: ResolvedMembership;
  user: TUser;
  convexAuthOrganizationId: Id<"organizations">;
  convexAuthUserId: Id<"users">;
}): B2BViewer<TUser, TAnchor> {
  const viewerHasPermission = (permission: string): boolean =>
    hasPermission(membership.permissions, permission);

  return {
    mode: "b2b",
    identity: {
      subject: identity.subject,
      issuer: identity.issuer,
      ...(typeof identity.tokenIdentifier === "string"
        ? { tokenIdentifier: identity.tokenIdentifier }
        : {}),
    },
    user,
    convexAuthUserId: toConsumerId(convexAuthUserId),
    anchor,
    convexAuthOrganizationId: toConsumerId(convexAuthOrganizationId),
    membership,
    hasPermission: viewerHasPermission,
    requirePermission: (permission) => {
      if (!viewerHasPermission(permission)) {
        throwAuthError("FORBIDDEN", "PERMISSION_REQUIRED", `Permission required: ${permission}`);
      }
    },
    requireOrganization: () => convexAuthOrganizationId,
    requireRole: (...allowedRoleKeys) => {
      if (!allowedRoleKeys.includes(membership.roleKey)) {
        throwAuthError(
          "FORBIDDEN",
          "PERMISSION_REQUIRED",
          `Role required: one of [${allowedRoleKeys.join(", ")}]`,
        );
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Component reads — small helpers that wrap the precisely generated mounted
// FunctionReference signatures and normalize component ids at the boundary.
// ---------------------------------------------------------------------------

async function resolveComponentUserId(
  ctx: GlueCtx,
  component: ConvexAuthComponentHandle,
  subject: string,
  issuer: string,
  provider: string,
): Promise<Id<"users"> | null> {
  const found = await ctx.runQuery(component.identity.getByIdentity, {
    provider,
    issuer,
    subject,
  });
  return found === null ? null : toComponentId("users", found.userId);
}

/**
 * Build the final permission set for a membership: role-derived
 * permissions → expansion (consumer's domain) → override merge
 * ({add, remove} contract). All three steps are noop-safe; consumers that
 * don't supply the expansion or override callbacks just get the raw
 * component-stored role.permissions.
 */
async function resolveMembershipPermissions<
  TUser extends GlueUserMinimum,
  TAnchor extends GlueAnchorMinimum,
>(
  ctx: GlueCtx,
  adapters: B2BModeAdapters<TUser, TAnchor>,
  member: {
    _id: string;
    organizationId: string;
  },
  role: { key: string; permissions: readonly string[] },
  convexAuthUserId: string,
): Promise<string[]> {
  const expanded =
    adapters.expandPermissions !== undefined
      ? adapters.expandPermissions(role.key, role.permissions)
      : role.permissions;
  const baseSet = new Set(expanded);
  if (adapters.resolvePermissionOverride === undefined) {
    return [...baseSet];
  }
  const override = await adapters.resolvePermissionOverride(ctx, {
    convexAuthMemberId: toConsumerId(member._id),
    convexAuthOrganizationId: toConsumerId(member.organizationId),
    convexAuthUserId: toConsumerId(convexAuthUserId),
    basePermissions: [...baseSet],
  });
  if (override === null) return [...baseSet];
  for (const p of override.remove) baseSet.delete(p);
  for (const p of override.add) baseSet.add(p);
  return [...baseSet];
}

async function fetchMembership<TUser extends GlueUserMinimum, TAnchor extends GlueAnchorMinimum>(
  ctx: GlueCtx,
  component: ConvexAuthComponentHandle,
  adapters: B2BModeAdapters<TUser, TAnchor>,
  convexAuthOrganizationId: Id<"organizations">,
  convexAuthUserId: Id<"users">,
): Promise<ResolvedMembership | null> {
  const member = await ctx.runQuery(component.organizations.getMemberByUserOrganization, {
    organizationId: convexAuthOrganizationId,
    userId: convexAuthUserId,
  });
  if (member === null || member.status !== "active") return null;

  const role = await ctx.runQuery(component.organizations.getRole, {
    roleId: member.roleId,
    organizationId: member.organizationId,
  });
  if (role === null) return null;

  const permissions = await resolveMembershipPermissions(
    ctx,
    adapters,
    member,
    role,
    convexAuthUserId,
  );
  return {
    convexAuthMemberId: toConsumerId(member._id),
    roleKey: role.key,
    status: member.status,
    permissions,
  };
}

// ---------------------------------------------------------------------------
// Self-heal + bootstrap — idempotent. Both call into `bootstrapMembership`
// which is the single source of truth for "ensure this user has a usable
// active organization."
// ---------------------------------------------------------------------------

async function selfHeal<TUser extends GlueUserMinimum, TAnchor extends GlueAnchorMinimum>(args: {
  ctx: GlueCtx;
  config: B2BModeConfig<TUser, TAnchor>;
  invitedUsersGetPersonalOrg: boolean;
  identityProvider: string;
  user: TUser;
  convexAuthUserId: Id<"users">;
  email?: string;
  name?: string;
}): Promise<{
  user: TUser;
  convexAuthOrganizationId: Id<"organizations">;
  membership: ResolvedMembership;
} | null> {
  const {
    ctx,
    config,
    invitedUsersGetPersonalOrg,
    identityProvider,
    convexAuthUserId,
    email,
    name,
  } = args;

  const bootstrapped = await bootstrapMembership({
    ctx,
    config,
    invitedUsersGetPersonalOrg,
    identityProvider,
    convexAuthUserId,
    email: email ?? "",
    name,
  });
  if (bootstrapped === null) return null;

  // Persist the active-org hint so future requests skip the heal path.
  // Best-effort: if the consumer's adapter throws (e.g. a QueryCtx that
  // can't write — the most common case where bootstrap succeeded via the
  // read-only "user already has membership" branch), swallow it. The
  // viewer for THIS request is already correct from `bootstrapped`; the
  // hint will be persisted on the next mutation that triggers self-heal.
  // This avoids forcing every consumer adapter to implement the same
  // ctx.db.patch defensive check.
  try {
    await config.adapters.setActiveOrganization(
      ctx,
      args.user,
      toConsumerId(bootstrapped.convexAuthOrganizationId),
    );
  } catch {
    // Intentional no-op — see comment above.
  }
  const refreshed = await config.adapters.findUserByConvexAuthUserId(
    ctx,
    toConsumerId(convexAuthUserId),
  );
  return {
    user: refreshed ?? args.user,
    convexAuthOrganizationId: bootstrapped.convexAuthOrganizationId,
    membership: bootstrapped.membership,
  };
}

async function bootstrapMembership<
  TUser extends GlueUserMinimum,
  TAnchor extends GlueAnchorMinimum,
>(args: {
  ctx: GlueCtx;
  config: B2BModeConfig<TUser, TAnchor>;
  invitedUsersGetPersonalOrg: boolean;
  identityProvider: string;
  convexAuthUserId: Id<"users">;
  email: string;
  name?: string;
}): Promise<{
  convexAuthOrganizationId: Id<"organizations">;
  membership: ResolvedMembership;
} | null> {
  const { ctx, config, invitedUsersGetPersonalOrg, convexAuthUserId, email, name } = args;
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;

  const componentUserId = convexAuthUserId;

  const existing = await bootstrapExistingMembership({
    componentUserId,
    config,
    ctx,
    email,
    name,
    convexAuthUserId,
  });
  if (existing !== null) return existing;

  if (!invitedUsersGetPersonalOrg) {
    return null;
  }

  return await bootstrapPersonalOrganization({
    componentUserId,
    config,
    ctx,
    email,
    name,
    convexAuthUserId,
  });
}

type BootstrapMembershipResult = {
  convexAuthOrganizationId: Id<"organizations">;
  membership: ResolvedMembership;
};

async function bootstrapExistingMembership<
  TUser extends GlueUserMinimum,
  TAnchor extends GlueAnchorMinimum,
>({
  componentUserId,
  config,
  ctx,
  email,
  name,
  convexAuthUserId,
}: {
  componentUserId: Id<"users">;
  config: B2BModeConfig<TUser, TAnchor>;
  ctx: GlueCtx;
  email: string;
  name?: string;
  convexAuthUserId: Id<"users">;
}): Promise<BootstrapMembershipResult | null> {
  const existingMemberships = await ctx.runQuery(
    config.component.organizations.listMembershipsByUser,
    { userId: componentUserId },
  );
  const firstActive = existingMemberships.find((membership) => membership.status === "active");
  if (firstActive === undefined) return null;
  const convexAuthOrganizationId = toComponentId("organizations", firstActive.organizationId);

  const role = await ctx.runQuery(config.component.organizations.getRole, {
    roleId: firstActive.roleId,
    organizationId: firstActive.organizationId,
  });
  if (role === null) return null;

  await ensureAnchor(ctx, config, convexAuthOrganizationId, convexAuthUserId, name ?? email);
  const permissions = await resolveMembershipPermissions(
    ctx,
    config.adapters,
    firstActive,
    role,
    convexAuthUserId,
  );
  return {
    convexAuthOrganizationId,
    membership: {
      convexAuthMemberId: toConsumerId(firstActive._id),
      roleKey: role.key,
      status: firstActive.status,
      permissions,
    },
  };
}

async function bootstrapPersonalOrganization<
  TUser extends GlueUserMinimum,
  TAnchor extends GlueAnchorMinimum,
>({
  componentUserId,
  config,
  ctx,
  email,
  name,
  convexAuthUserId,
}: {
  componentUserId: Id<"users">;
  config: B2BModeConfig<TUser, TAnchor>;
  ctx: GlueCtx;
  email: string;
  name?: string;
  convexAuthUserId: Id<"users">;
}): Promise<BootstrapMembershipResult | null> {
  const personalName = name ?? email ?? "Personal";
  const upsertResult = await ctx.runMutation?.(config.component.organizations.upsertOrganization, {
    name: personalName,
    slug: `personal-${componentUserId}`,
    createdBy: componentUserId,
  });
  if (upsertResult === undefined) {
    throw new ConvexError({
      code: "INTERNAL",
      message: "convex-auth glue: ctx.runMutation unavailable in bootstrap",
    });
  }
  const convexAuthOrganizationId = toComponentId("organizations", upsertResult.organizationId);

  await ctx.runMutation?.(config.component.organizations.seedDefaultRoles, {
    organizationId: convexAuthOrganizationId,
  });
  const ownerRole = await ctx.runQuery(config.component.organizations.getRoleByKey, {
    organizationId: convexAuthOrganizationId,
    key: "owner",
  });
  if (ownerRole === null) return null;
  const memberResult = await ctx.runMutation?.(config.component.organizations.upsertMember, {
    organizationId: convexAuthOrganizationId,
    userId: componentUserId,
    roleId: ownerRole._id,
    status: "active",
  });
  if (memberResult === undefined) return null;
  await ensureAnchor(ctx, config, convexAuthOrganizationId, convexAuthUserId, personalName);

  const permissions = await resolveMembershipPermissions(
    ctx,
    config.adapters,
    { _id: memberResult.memberId, organizationId: convexAuthOrganizationId },
    ownerRole,
    convexAuthUserId,
  );
  return {
    convexAuthOrganizationId,
    membership: {
      convexAuthMemberId: toConsumerId(memberResult.memberId),
      roleKey: ownerRole.key,
      status: "active",
      permissions,
    },
  };
}

async function ensureAnchor<TUser extends GlueUserMinimum, TAnchor extends GlueAnchorMinimum>(
  ctx: GlueCtx,
  config: B2BModeConfig<TUser, TAnchor>,
  convexAuthOrganizationId: Id<"organizations">,
  createdByConvexAuthUserId: Id<"users">,
  name: string,
): Promise<void> {
  const existing = await config.adapters.findAnchorByConvexAuthOrganizationId(
    ctx,
    toConsumerId(convexAuthOrganizationId),
  );
  if (existing !== null) return;
  // QueryCtx guard: the consumer's `insertAnchor` adapter would throw a
  // raw `TypeError: db.insert is not a function` when called from a
  // read-only context. Short-circuit with the canonical ANCHOR_MISSING
  // error instead — the next mutation will re-fire self-heal and create
  // the anchor then. This keeps the consumer's adapter free of the
  // QueryCtx defensive check and gives callers a stable error contract.
  //
  // The bootstrap path triggered this risk on cold starts when the first
  // request after sign-in was a query (reactive list, dashboard, etc.).
  // Some consumers both hit it once before this guard landed. See
  // `docs/migration/truth-migration-playbook.md` § Anchor-must-exist.
  const dbMaybe = Reflect.get(ctx, "db");
  if (
    typeof dbMaybe !== "object" ||
    dbMaybe === null ||
    typeof Reflect.get(dbMaybe, "insert") !== "function"
  ) {
    throwAuthError(
      "NOT_FOUND",
      "ANCHOR_MISSING",
      "Local organization anchor missing; retry via a mutation context",
    );
  }
  await config.adapters.insertAnchor(ctx, {
    convexAuthOrganizationId: toConsumerId(convexAuthOrganizationId),
    name,
    createdByConvexAuthUserId: toConsumerId(createdByConvexAuthUserId),
  });
}
