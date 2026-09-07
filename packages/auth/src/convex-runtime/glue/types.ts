/**
 * Adapter-based glue types.
 *
 * The package owns auth SEMANTICS (identity resolution, viewer assembly,
 * permission decisions, idempotent bootstrap, self-heal). The CONSUMER owns
 * local storage (their `users` table, their `organizations` anchor) and
 * supplies thin adapter callbacks. This matches the precedent set by
 * `createConvexApiAuthLookupAdapter` —
 * package never reaches into consumer tables by name.
 *
 * Two modes, type-discriminated:
 *  - `orgs: "enabled"` — B2B (e.g. multi-tenant SaaS consumers). Full org
 *    surface; anchor adapters required; viewer exposes `requireOrganization`.
 *  - `orgs: "disabled"` — consumer apps. No org context; viewer has no
 *    org methods. Anchor adapters not required.
 */

import type {
  FunctionReference,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";

// Type-only: erased at compile time, so this adds NO runtime dependency and no
// bundle edge from packages/convex to the component. It exists purely so the
// handle's arg/return types come from the component's own validators.
import type { ComponentApi as ConvexAuthGeneratedComponentApi } from "../../component/_generated/component";
import type { AuthErrorAuthzCode, AuthErrorCode } from "./throwAuthError";

// ----------------------------------------------------------------------------
// Generic ctx shape used by adapters. We mirror the surface Convex query/
// mutation contexts actually expose, so consumers can pass `ctx` straight in.
// ----------------------------------------------------------------------------

/**
 * NOTE on runQuery / runMutation typing: these mirror Convex's exported
 * generic ctx method signatures. Consumers can pass their generated ctx objects
 * straight through without widening the package contract to `any`.
 */
export type GlueCtx = {
  auth: {
    getUserIdentity: () => Promise<{
      subject: string;
      issuer: string;
      tokenIdentifier?: string;
      [claim: string]: unknown;
    } | null>;
  };
  runQuery: GenericQueryCtx<GenericDataModel>["runQuery"];
  runMutation?: GenericMutationCtx<GenericDataModel>["runMutation"];
  db?: unknown;
};

// ----------------------------------------------------------------------------
// Consumer-provided adapter callbacks
// ----------------------------------------------------------------------------

/**
 * The minimum shape the glue needs to know about a "local user" row.
 * Whatever the consumer's full row shape is, it MUST include these fields.
 * Returned as `viewer.user` so handlers can read app-side fields.
 */
export type GlueUserMinimum = {
  _id: unknown;
  convexAuthUserId?: string;
  activeConvexAuthOrganizationId?: string;
};

/**
 * The minimum shape the glue needs to know about a "local organization"
 * anchor row. `convexAuthOrganizationId` is the bridge to the component.
 */
export type GlueAnchorMinimum = {
  _id: unknown;
  convexAuthOrganizationId: string;
};

export type ConsumerModeAdapters<TUser extends GlueUserMinimum> = {
  /**
   * Look up the local user by the **already-resolved** component-side user id.
   *
   * IMPORTANT: this is a pure index lookup. The `convexAuthUserId` argument
   * is the canonical, authoritative component-side userId — the glue has
   * already resolved it from `ctx.auth.getUserIdentity()` and an
   * `identity.getByIdentity` round-trip. **Do not** re-resolve from
   * `ctx.auth.getUserIdentity()` inside this adapter; doing so defeats
   * the glue's 2-hop resolution and breaks bootstrap on first-touch.
   *
   * Implementation shape (verbatim):
   *
   *   findUserByConvexAuthUserId: async (ctx, convexAuthUserId) =>
   *     await ctx.db
   *       .query("users")
   *       .withIndex("by_convex_auth_user", (q) =>
   *         q.eq("convexAuthUserId", convexAuthUserId),
   *       )
   *       .unique(),
   *
   * Index name and table name are the consumer's choice; the glue does not
   * know either. Returns null if no local row exists yet (glue self-heals
   * via `bootstrapNewUser`).
   */
  findUserByConvexAuthUserId: (ctx: GlueCtx, convexAuthUserId: string) => Promise<TUser | null>;
};

export type B2BModeAdapters<
  TUser extends GlueUserMinimum,
  TAnchor extends GlueAnchorMinimum,
> = ConsumerModeAdapters<TUser> & {
  /**
   * Look up the local `organizations` anchor by the component organization id
   * (the string stored on the anchor and on `user.activeConvexAuthOrganizationId`).
   */
  findAnchorByConvexAuthOrganizationId: (
    ctx: GlueCtx,
    convexAuthOrganizationId: string,
  ) => Promise<TAnchor | null>;

  /**
   * Insert a new local anchor row. The glue calls this during
   * `bootstrapNewUser` and during self-heal when an anchor is missing.
   *
   * The glue passes the canonical fields it controls; the consumer can
   * compose with its own domain-specific fields inside the implementation
   * (slug rules, business name, etc. live in the consumer, NOT the glue).
   */
  insertAnchor: (
    ctx: GlueCtx,
    args: {
      convexAuthOrganizationId: string;
      name: string;
      createdByConvexAuthUserId: string;
    },
  ) => Promise<TAnchor>;

  /**
   * Patch the local user's `activeConvexAuthOrganizationId`. The glue calls
   * this during bootstrap/self-heal to attach the user to an org.
   */
  setActiveOrganization: (
    ctx: GlueCtx,
    user: TUser,
    convexAuthOrganizationId: string,
  ) => Promise<void>;

  /**
   * @deprecated Per-member permission overrides are a legacy escape hatch.
   *
   * The canonical model is: roles carry permissions, members carry roles.
   * Per-member overrides are an anti-pattern that:
   *   1. Stores authorization state OUTSIDE the component's source of truth
   *   2. Forces consumers to maintain a mirror table indexed by
   *      convexAuthMemberId — exactly the pattern the consumer-contract
   *      checker flags as `local-bridge-mirror` (see
   *      docs/migration/truth-migration-playbook.md M3 "per-member
   *      metadata triage").
   *   3. Was already removed from a consumer (PR #23 dropped `member_settings`
   *      entirely — feature had 0 rows in prod, was never actually used).
   *
   * Codex audit (2026-05-28): this adapter slot keeps the anti-pattern
   * alive as a first-class seam. Prefer one of:
   *   - Express the variance as a NEW role and assign it (component-truth)
   *   - Move the override into the component (add as a member field)
   *   - Delete the feature (the consumer precedent)
   *
   * The adapter remains in the API for transitional migrations only. It
   * will be removed in a future major (planned for v0.2.0). New consumers
   * MUST NOT implement this adapter — leave it undefined.
   *
   * If you find yourself wanting overrides today, ask: what role would
   * capture this variance? That role is the right answer.
   *
   * `add` and `remove` operate against the role-derived `basePermissions`.
   * Raw replacement arrays were intentionally rejected — that shape is
   * underspecified and was how earlier integrations diverged.
   */
  resolvePermissionOverride?: (
    ctx: GlueCtx,
    args: {
      convexAuthMemberId: string;
      convexAuthOrganizationId: string;
      convexAuthUserId: string;
      basePermissions: string[];
    },
  ) => Promise<{ add: string[]; remove: string[] } | null>;

  /**
   * OPTIONAL permission expansion applied to the role's
   * `role.permissions` array stored in the component, BEFORE the override
   * is merged. Consumers that use wildcards (`*` → all permissions),
   * inheritance (`role:admin` → expands to admin's full set), or any
   * other domain-specific expansion plug their logic here.
   *
   * If omitted, the glue surfaces the raw component-stored permissions
   * unchanged. The legacy consumer `buildPermissionContext` path uses
   * `getExpandedPermissions(roleKey)` — Phase 2 back-ports wire that
   * same function through this callback.
   *
   * Receives BOTH the role key (e.g. "owner") and the raw permissions
   * array so consumers can dispatch either way.
   */
  expandPermissions?: (roleKey: string, permissions: readonly string[]) => readonly string[];
};

// ----------------------------------------------------------------------------
// Component handle — the typed reference the consumer constructs in
// `convex.config.ts` via `components.convexAuth`. We don't type the full
// FunctionReference tree; the glue only calls a known subset.
// ----------------------------------------------------------------------------

/**
 * The component's API, derived from Convex's generated `ComponentApi` — the
 * exact shape consumers receive at `components.convexAuth`. Deriving beats
 * declaring: mounted visibility, serialized ids, args, and return types all
 * stay aligned with Convex codegen.
 *
 * This replaced hand-written `FunctionReference<"query", "public" | "internal">`
 * entries. FunctionReference takes five type parameters
 * <Type, Visibility, Args, ReturnType, ComponentPath>; those declared two, so
 * Convex filled Args and ReturnType with their `any` defaults. Every call
 * through the handle was therefore untyped, which is why the call sites needed
 * `as never` on the reference AND on the args, then asserted the result back
 * into a shape. 385 no-unsafe-type-assertion findings traced to this: the
 * assertions really were unsafe, because the values really were `any`.
 */
type ConvexAuthComponentApi = ConvexAuthGeneratedComponentApi;

/**
 * Preserve generated function args and returns while allowing the same
 * reference shape at either visibility. Convex emits internal references when
 * a component is mounted in a consumer.
 */
export type PickComponentFunctions<TModule, TKeys extends keyof TModule> = {
  [TKey in TKeys]: TModule[TKey] extends FunctionReference<
    infer TType,
    infer _TVisibility,
    infer TArgs,
    infer TReturn,
    infer TComponentPath
  >
    ? FunctionReference<TType, "public" | "internal", TArgs, TReturn, TComponentPath>
    : never;
};

export type ConvexAuthComponentHandle = {
  identity: PickComponentFunctions<ConvexAuthComponentApi["identity"], "getByIdentity">;
  organizations: PickComponentFunctions<
    ConvexAuthComponentApi["organizations"],
    | "getMemberByUserOrganization"
    | "listMembersByOrganization"
    | "listMembershipsByUser"
    | "getRole"
    | "getRoleByKey"
    | "upsertOrganization"
    | "upsertMember"
    | "seedDefaultRoles"
  >;
};

// ----------------------------------------------------------------------------
// Config types — discriminated by `orgs` literal
// ----------------------------------------------------------------------------

export type ConsumerModeConfig<TUser extends GlueUserMinimum> = {
  orgs: "disabled";
  component: ConvexAuthComponentHandle;
  adapters: ConsumerModeAdapters<TUser>;
  /** Provider stored on the component identity row. Defaults to `"convex-auth"`. */
  identityProvider?: string;
};

export type B2BModeConfig<TUser extends GlueUserMinimum, TAnchor extends GlueAnchorMinimum> = {
  orgs: "enabled";
  component: ConvexAuthComponentHandle;
  adapters: B2BModeAdapters<TUser, TAnchor>;
  /**
   * When a user signs up directly (no pending invitation), should the glue
   * create a personal organization for them?
   *
   * Default: `false`. Recommended for B2B SaaS where users land via invite
   * or onboarding-driven org creation (Slack, Notion, Linear). Set to `true`
   * for "every user always has a personal workspace"
   * (GitHub-style). Once set, do not flip — it changes provisioning
   * semantics for existing users.
   */
  invitedUsersGetPersonalOrg?: boolean;
  /**
   * The provider name stored on component `auth_identities.provider` for
   * this consumer's identities. The glue uses it when calling
   * `components.convexAuth.identity.getByIdentity` during membership
   * resolution + bootstrap.
   *
   * Defaults to `"convex-auth"` (the package's own provider key for
   * native-convex-auth identities). Consumers on legacy (`better-auth`)-backed
   * provisioning (where `convex-auth/better-auth` writes
   * identity rows with `provider: "better-auth"`) MUST pass
   * `"better-auth"`. Get the right value via
   * `getBetterAuthIdentityProvider()` from the better-auth bridge module.
   */
  identityProvider?: string;
};

export type GlueConfig<TUser extends GlueUserMinimum, TAnchor extends GlueAnchorMinimum> =
  | ConsumerModeConfig<TUser>
  | B2BModeConfig<TUser, TAnchor>;

// ----------------------------------------------------------------------------
// Viewer return types — separate shape per mode so the type system enforces
// "no `requireOrganization` in consumer mode."
// ----------------------------------------------------------------------------

export type ResolvedMembership = {
  /** Component member id. */
  convexAuthMemberId: string;
  /** Role template key (e.g. "owner", "admin", "member"). */
  roleKey: string;
  status: "active" | "invited" | "suspended";
  /** Permissions after role expansion + optional override merge. */
  permissions: string[];
};

export type BaseViewer<TUser extends GlueUserMinimum> = {
  identity: {
    subject: string;
    issuer: string;
    tokenIdentifier?: string;
  };
  user: TUser;
  convexAuthUserId: string;
  hasPermission: (permission: string) => boolean;
  requirePermission: (permission: string) => void;
};

export type ConsumerViewer<TUser extends GlueUserMinimum> = BaseViewer<TUser> & {
  mode: "consumer";
};

export type B2BViewer<
  TUser extends GlueUserMinimum,
  TAnchor extends GlueAnchorMinimum,
> = BaseViewer<TUser> & {
  mode: "b2b";
  anchor: TAnchor;
  convexAuthOrganizationId: string;
  membership: ResolvedMembership;
  requireOrganization: () => string;
  requireRole: (...allowedRoleKeys: string[]) => void;
};

export type Viewer<TUser extends GlueUserMinimum, TAnchor extends GlueAnchorMinimum> =
  | ConsumerViewer<TUser>
  | B2BViewer<TUser, TAnchor>;

// ----------------------------------------------------------------------------
// The factory return type
// ----------------------------------------------------------------------------

export type ConsumerGlue<TUser extends GlueUserMinimum> = {
  mode: "consumer";
  /**
   * Resolve the viewer for the current request. ONE round-trip per request;
   * subsequent `require*` calls are synchronous against the cached viewer.
   * Throws a canonical ConvexError on failure.
   */
  resolveViewer: (ctx: GlueCtx) => Promise<ConsumerViewer<TUser>>;
  /**
   * Idempotent bootstrap. Call from the legacy (`better-auth`) `databaseHooks.user.create.after`
   * (which `better-auth` >=1.7.0 runs POST-commit — the user is already
   * persisted). Glue ALSO self-heals on first authenticated `resolveViewer`
   * if bootstrap was skipped or failed, so this hook is best-effort, not
   * load-bearing.
   */
  bootstrapNewUser: (
    ctx: GlueCtx,
    args: { convexAuthUserId: string; email: string; name?: string },
  ) => Promise<void>;
};

export type B2BGlue<TUser extends GlueUserMinimum, TAnchor extends GlueAnchorMinimum> = {
  mode: "b2b";
  resolveViewer: (ctx: GlueCtx) => Promise<B2BViewer<TUser, TAnchor>>;
  bootstrapNewUser: (
    ctx: GlueCtx,
    args: { convexAuthUserId: string; email: string; name?: string },
  ) => Promise<void>;
};

export type Glue<TUser extends GlueUserMinimum, TAnchor extends GlueAnchorMinimum> =
  | ConsumerGlue<TUser>
  | B2BGlue<TUser, TAnchor>;

// Re-export error types so consumers only need one import path.
export type { AuthErrorAuthzCode, AuthErrorCode };
