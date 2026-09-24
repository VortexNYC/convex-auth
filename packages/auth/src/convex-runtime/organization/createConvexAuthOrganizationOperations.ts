/**
 * Component reader/writer operations factory (Increment 3).
 *
 * Absorbs the orchestration every convexAuth B2B consumer otherwise
 * re-implements to talk to the `convexAuth` component:
 *   - READERS map opaque component org/member/role/invitation/api-key results
 *     back to the consumer's LOCAL anchor ids + consumer DTO shapes.
 *   - WRITERS run the ensure-chain (org → role → member), upsert invitations /
 *     api-keys, and backfill the consumer's local bridge id.
 *
 * The package owns the SAFETY ("never invent access"):
 *   - members / roles / invitations whose component role `.key` is not a valid
 *     consumer role template are DROPPED (or surfaced as `roleKey: null` where
 *     the consumer explicitly opts into a single-member lookup).
 *   - a component org / user with no LOCAL anchor resolves to `null`; the
 *     membership / api-key / invitation is dropped rather than fabricated.
 *   - component member status is mapped through `mapMemberStatus`, never echoed.
 *
 * Consumer-specific seams are passed in as `config` callbacks:
 *   - `component` — the `components.convexAuth` handle (typed via
 *     `ConvexAuthComponentHandle`).
 *   - `resolveLocalOrganizationId` / `resolveLocalUserId` — the SAME anchor
 *     lookups the glue already uses (`findAnchorByConvexAuthOrganizationId` /
 *     `findUserByConvexAuthUserId`), projected to the local id.
 *   - `validateRoleKey` — the consumer's role-template type guard.
 *   - `roleCatalog` — roleKey → permissions[], the writers seed/ensure from it.
 *   - writer-only: `loadOrganizationForUpsert`, `backfillOrganizationBridgeId`,
 *     `loadUserBridgeId` — the only places the package touches a local row.
 *
 * The package CANNOT touch consumer tables directly; every local-row access
 * flows through the callbacks above. Component calls go through typed
 * `ctx.runQuery` / `ctx.runMutation` references derived from the component's
 * validators. The
 * suite is generic over the consumer's REAL query/mutation ctx (see the ctx
 * contract below), so the consumer's typed `ctx.db` flows into its own
 * callbacks with no cast; it defaults to `GlueCtx` for back-compat.
 */
import type {
  FunctionReturnType,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";

import type { ComponentApi as ConvexAuthGeneratedComponentApi } from "../../component/_generated/component";
import type { ComponentApi as CoreComponentApi } from "../../component/core/_generated/component";
import type { ComponentApi as OrganizationsComponentApi } from "../../component/organizations/_generated/component";
import type { ComponentApi as ApiKeysComponentApi } from "../../component/apiKeys/_generated/component";
import type { GlueCtx, PickComponentFunctions } from "../glue/types";

/**
 * Component-boundary ids cross the Convex component boundary as `string`: convex
 * codegen erases branded ids in the generated `ComponentApi`, so
 * `components.convexAuth` (the handle a consumer passes) exposes them as
 * `string`. This factory only ever handles boundary ids — consumer-anchored ids
 * are the `TOrgId` / `TUserId` generics — so every `Id<...>` below is a boundary
 * string, kept table-tagged for documentation only.
 */
type Id<_TableName extends string> = string;

/**
 * Operations ctx contract
 *
 * The factory ITSELF only ever touches `ctx.runQuery` (readers) and
 * `ctx.runMutation` (writers) — it never reads `ctx.db` or `ctx.auth`. Local-row
 * access lives entirely in the consumer-supplied callbacks. So the suite is
 * generic over the consumer's REAL query/mutation ctx (constrained only to what
 * the factory uses), which lets the consumer's typed `db` flow straight into its
 * own callbacks with NO cast. The previous `GlueCtx`-typed callbacks forced
 * consumers to cast their ctx in (`auth` is required on `GlueCtx`) and re-cast
 * `ctx.db` back out of `unknown` in every callback. Defaults stay `GlueCtx`, so
 * this is fully back-compatible for any consumer that does not specify the ctx.
 */

/** Minimal ctx the reader suite needs: a component `runQuery`. */
export type ConvexAuthOperationsReadCtx = {
  runQuery: GenericQueryCtx<GenericDataModel>["runQuery"];
};

/** Minimal ctx the writer suite needs: `runQuery` + `runMutation`. */
export type ConvexAuthOperationsWriteCtx = ConvexAuthOperationsReadCtx & {
  runMutation?: GenericMutationCtx<GenericDataModel>["runMutation"];
};

/**
 * Status mapping
 */

/** Component member status enum (the component's source of truth). */
export type ComponentMemberStatus = "active" | "invited" | "suspended";

/**
 * Consumer-facing membership status. The component has no "inactive" status;
 * `invited` maps to `pending` to match the legacy local-member vocabulary every
 * consumer already consumes.
 */
export type OperationsMemberStatus = "active" | "pending" | "suspended";

/** Component invitation status enum (mirrors the component schema). */
export type ComponentInvitationStatus = "pending" | "accepted" | "revoked" | "expired";

/** Component invitation email-delivery status enum (mirrors the component). */
export type ComponentInvitationEmailDeliveryStatus =
  | "not_configured"
  | "queued"
  | "sent"
  | "delivered"
  | "delivery_delayed"
  | "bounced"
  | "failed";

/** Component apiKey status enum (mirrors the component schema). */
export type ComponentApiKeyStatus = "active" | "revoked";

function mapMemberStatus(status: ComponentMemberStatus): OperationsMemberStatus {
  switch (status) {
    case "active":
      return "active";
    case "invited":
      return "pending";
    case "suspended":
      return "suspended";
    default:
      throw new TypeError("Unsupported component member status");
  }
}

/**
 * Component result shapes are derived from the component's validators.
 */

/**
 * Derived from the GENERATED `ComponentApi` — the same string-erased handle a
 * consumer passes as `components.convexAuth` — NOT `ApiFromModules` over the
 * source modules, whose branded ids no consumer can supply across the boundary.
 */
type OperationsComponentApi = ConvexAuthGeneratedComponentApi;

type ConvexAuthOrganizationOperationsIdentityModule =
  | CoreComponentApi["identity"]
  | OrganizationsComponentApi["identity"]
  | OperationsComponentApi["identity"];

type ConvexAuthOrganizationOperationsOrganizationsModule =
  | OrganizationsComponentApi["organizations"]
  | OperationsComponentApi["organizations"];

type ConvexAuthOrganizationOperationsApiKeysModule =
  | ApiKeysComponentApi["apiKeys"]
  | OperationsComponentApi["apiKeys"];

type OperationsGlueComponentHandle = {
  identity: PickComponentFunctions<ConvexAuthOrganizationOperationsIdentityModule, "getByIdentity">;
  organizations: PickComponentFunctions<
    ConvexAuthOrganizationOperationsOrganizationsModule,
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

type ComponentMember = NonNullable<
  FunctionReturnType<OperationsComponentApi["organizations"]["getMemberByIdForSystem"]>
>;
type ComponentApiKey = NonNullable<
  FunctionReturnType<OperationsComponentApi["apiKeys"]["getApiKey"]>
>;
type ComponentInvitation = NonNullable<
  FunctionReturnType<OperationsComponentApi["organizations"]["getInvitationByTokenHash"]>
>;

/**
 * Consumer-facing DTOs — generic over the consumer's branded ids + role type.
 */

/**
 * A component membership resolved + mapped into consumer domain keys. Mirrors
 * the fields a consumer read off a local member row (organizationId, role,
 * status) PLUS the component member id for traceability.
 */
export type ResolvedComponentMembership<TOrgId, TRole extends string> = {
  /** Local (consumer-anchored) organization id. */
  organizationId: TOrgId;
  /** Validated consumer role template (component role `.key`). */
  roleTemplate: TRole;
  status: OperationsMemberStatus;
  /** Component member id (the sole member identity now). */
  convexAuthMemberId: Id<"organization_members">;
};

/**
 * A component member of an organization, mapped into the consumer-facing shape
 * member-list readers build. `userId` is `null` when the component user has no
 * local anchor (callers needing a concrete user skip these).
 */
export type ResolvedComponentOrganizationMember<TUserId, TRole extends string> = {
  memberId: Id<"organization_members">;
  userId: TUserId | null;
  roleTemplate: TRole;
  status: OperationsMemberStatus;
  createdAt: number;
  updatedAt: number;
};

/**
 * A single component member resolved by component member id. `roleTemplate` is
 * `null` when the role key is not a consumer template (callers must treat that
 * as "no role").
 */
export type ResolvedComponentMemberById<TOrgId, TUserId, TRole extends string> = {
  memberId: Id<"organization_members">;
  organizationId: TOrgId | null;
  userId: TUserId | null;
  roleTemplate: TRole | null;
  status: OperationsMemberStatus;
  /** The component role id (needed to re-resolve / set roles). */
  roleId: Id<"organization_roles">;
  createdAt: number;
  updatedAt: number;
};

/** A component role mapped into the consumer-facing shape role readers consume. */
export type ResolvedComponentRole<TOrgId> = {
  roleId: Id<"organization_roles">;
  organizationId: TOrgId | null;
  /** The component role key (consumer role name). */
  name: string;
  permissions: string[];
  isSystem: boolean;
  createdAt: number;
  updatedAt: number;
};

/** A component member ref (member id + role id) for writers that only need ids. */
export type ComponentMemberRef = {
  memberId: Id<"organization_members">;
  roleId: Id<"organization_roles">;
};

/**
 * A component apiKey resolved + mapped into local-anchored ids. Drops keys with
 * no local anchor org/user so the hot auth path never authenticates against an
 * unmappable key.
 */
export type ResolvedComponentApiKey<TOrgId, TUserId> = {
  _id: Id<"api_keys">;
  organizationId: TOrgId;
  userId: TUserId;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: string[];
  allowedIpRanges?: string[];
  expiresAt?: number;
  status: ComponentApiKeyStatus;
  requestId?: string;
  requestIdExpiresAt?: number;
  lastUsedAt?: number;
  lastUsedIp?: string;
  createdAt: number;
  updatedAt: number;
};

/**
 * A component invitation resolved + mapped into the consumer-domain shape.
 * Dropped (the reader returns `null` / omits it) when it cannot be safely
 * mapped: missing local anchor org, unknown role key, or unmapped inviter.
 */
export type ResolvedComponentInvitation<TOrgId, TUserId, TRole extends string> = {
  _id: Id<"organization_invitations">;
  organizationId: TOrgId;
  email: string;
  tokenHash: string;
  roleTemplate: TRole;
  status: ComponentInvitationStatus;
  invitedBy: TUserId;
  expiresAt: number;
  acceptedByUserId?: TUserId;
  acceptedAt?: number;
  emailId?: string;
  emailDeliveryStatus?: ComponentInvitationEmailDeliveryStatus;
  createdAt: number;
  updatedAt: number;
};

/**
 * Config + return shapes
 */

/**
 * The consumer's local org row projected into the fields the component
 * `upsertOrganization` mutation needs. Returned by `loadOrganizationForUpsert`.
 * `convexAuthOrganizationId` is the CURRENT bridge id (undefined before the
 * first anchor); the writer backfills the canonical id the component returns.
 */
export type OrganizationUpsertFields = {
  convexAuthOrganizationId: Id<"organizations"> | undefined;
  name: string;
  slug: string;
  imageUrl?: string | null;
  status: "active" | "suspended" | "deleted";
  metadataJson?: string | null;
};

/**
 * The component handle this factory needs — a SUPERSET of the glue's
 * `ConvexAuthComponentHandle`. Kept separate (not folded into the shared glue
 * handle) so plain `createConvexAuthGlue` consumers are NOT forced to type the
 * api-key / extra-org ops the glue path never calls. `components.convexAuth`
 * already exposes every op below at runtime, so a consumer passing
 * `components.convexAuth` satisfies both handles with no changes.
 */
export type ConvexAuthOrganizationOperationsComponentHandle = OperationsGlueComponentHandle & {
  organizations: PickComponentFunctions<
    ConvexAuthOrganizationOperationsOrganizationsModule,
    | "getMember"
    | "getMemberByIdForSystem"
    | "listRolesByOrganization"
    | "ensureRole"
    | "upsertInvitation"
    | "setInvitationStatus"
    | "recordInvitationEmailDelivery"
    | "getInvitationByTokenHash"
    | "getInvitationByEmailId"
    | "listInvitationsByOrganization"
  >;
  apiKeys: PickComponentFunctions<
    ConvexAuthOrganizationOperationsApiKeysModule,
    | "getApiKey"
    | "getApiKeyByPrefix"
    | "getApiKeyByRequestId"
    | "listApiKeysByOrganization"
    | "upsertApiKey"
    | "rotateApiKey"
    | "revokeApiKey"
    | "touchApiKeyLastUsed"
  >;
};

/**
 * Feature-gated component bag. Consumers can pass a single `component` (legacy
 * full or organizations component) OR this `components` object when they mount
 * the features as separate Convex components.
 */
export type ConvexAuthOrganizationOperationsComponentsHandle = {
  core: {
    identity: PickComponentFunctions<
      ConvexAuthOrganizationOperationsIdentityModule,
      "getByIdentity"
    >;
  };
  organizations: ConvexAuthOrganizationOperationsComponentHandle["organizations"];
  apiKeys: ConvexAuthOrganizationOperationsComponentHandle["apiKeys"];
};

/**
 * Errors
 *
 * Invariant violations the writers can hit at runtime (a local row the consumer
 * promised is gone, a user with no convexAuth bridge id, a writer wired with a
 * query ctx). The factory NEVER throws a bare `Error` — it throws a typed
 * `ConvexAuthOrganizationOperationsError` (carries a stable `code` + context) so
 * a consumer can branch on the failure. Better: pass `createError` in the config
 * and the factory throws the CONSUMER'S own error (e.g. a `ConvexError({ code,
 * message })`) directly at the failure site, so it surfaces structured to the
 * client with zero consumer catch/remap code.
 */

export type ConvexAuthOrganizationOperationsErrorCode =
  /** A writer was called with a ctx that has no `runMutation` (use a mutation/action ctx). */
  | "missing_run_mutation"
  /** `loadOrganizationForUpsert` returned null for an org the writer must upsert. */
  | "organization_not_found"
  /** A local user referenced by a write has no convexAuth bridge id yet. */
  | "user_bridge_id_missing";

/** Which local entity a `user_bridge_id_missing` / `organization_not_found` failure is about. */
export type ConvexAuthOrganizationOperationsErrorContext = {
  /** Stringified local organization id, when the failure is org-scoped. */
  localOrganizationId?: string;
  /** Stringified local user id whose bridge id is missing, when applicable. */
  localUserId?: string;
  /** Which user role the missing bridge id belongs to. */
  subject?: "member" | "invitation_creator" | "api_key_user";
};

export type ConvexAuthOrganizationOperationsErrorInput = {
  code: ConvexAuthOrganizationOperationsErrorCode;
  message: string;
  context?: ConvexAuthOrganizationOperationsErrorContext;
};

/**
 * Typed error the factory throws by default for an invariant violation. Mirrors
 * the package's `ApiAuthError` / `OrganizationInvitationPolicyError` convention:
 * a real `code` consumers can branch on, never an opaque string.
 */
export class ConvexAuthOrganizationOperationsError extends Error {
  readonly code: ConvexAuthOrganizationOperationsErrorCode;
  readonly context?: ConvexAuthOrganizationOperationsErrorContext;

  constructor(args: ConvexAuthOrganizationOperationsErrorInput) {
    super(args.message);
    this.name = "ConvexAuthOrganizationOperationsError";
    this.code = args.code;
    this.context = args.context;
  }
}

function defaultCreateOperationsError(args: ConvexAuthOrganizationOperationsErrorInput): Error {
  return new ConvexAuthOrganizationOperationsError(args);
}

type ConvexAuthOrganizationOperationsConfigBase<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx = GlueCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx = GlueCtx,
> = {
  resolveLocalOrganizationId: (
    ctx: TReadCtx,
    componentOrganizationId: Id<"organizations">,
  ) => Promise<TOrgId | null>;
  resolveLocalUserId: (ctx: TReadCtx, componentUserId: Id<"users">) => Promise<TUserId | null>;

  validateRoleKey: (key: string) => key is TRole;
  roleCatalog: Readonly<Record<TRole, readonly string[]>>;

  loadOrganizationForUpsert: (
    ctx: TWriteCtx,
    localOrganizationId: TOrgId,
  ) => Promise<OrganizationUpsertFields | null>;
  backfillOrganizationBridgeId: (
    ctx: TWriteCtx,
    localOrganizationId: TOrgId,
    componentOrganizationId: Id<"organizations">,
  ) => Promise<void>;
  loadUserBridgeId: (ctx: TWriteCtx, localUserId: TUserId) => Promise<Id<"users"> | null>;

  /**
   * Maps an invariant violation to the consumer's own error. Optional —
   * defaults to throwing a typed `ConvexAuthOrganizationOperationsError`.
   * Return e.g. `new ConvexError({ code, message })` to surface it structured
   * to the client directly at the failure site.
   */
  createError?: (args: ConvexAuthOrganizationOperationsErrorInput) => Error;
};

export type ConvexAuthOrganizationOperationsConfig<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx = GlueCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx = GlueCtx,
> =
  | (ConvexAuthOrganizationOperationsConfigBase<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx> & {
      component: ConvexAuthOrganizationOperationsComponentHandle;
      components?: never;
    })
  | (ConvexAuthOrganizationOperationsConfigBase<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx> & {
      component?: never;
      components: ConvexAuthOrganizationOperationsComponentsHandle;
    });

export type ConvexAuthOrganizationReads<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx = GlueCtx,
> = {
  resolveMemberships: (
    ctx: TReadCtx,
    convexAuthUserId: Id<"users"> | undefined | null,
  ) => Promise<ResolvedComponentMembership<TOrgId, TRole>[]>;
  resolveMembershipForOrganization: (
    ctx: TReadCtx,
    args: {
      convexAuthUserId: Id<"users"> | undefined | null;
      convexAuthOrganizationId: Id<"organizations"> | undefined | null;
      knownLocalOrganizationId?: TOrgId;
    },
  ) => Promise<ResolvedComponentMembership<TOrgId, TRole> | null>;
  listMembersByOrganization: (
    ctx: TReadCtx,
    convexAuthOrganizationId: Id<"organizations"> | undefined | null,
    options?: { status?: ComponentMemberStatus; limit?: number },
  ) => Promise<ResolvedComponentOrganizationMember<TUserId, TRole>[]>;
  getMemberById: (
    ctx: TReadCtx,
    componentMemberId: Id<"organization_members">,
  ) => Promise<ResolvedComponentMemberById<TOrgId, TUserId, TRole> | null>;
  getMemberRefForUserOrganization: (
    ctx: TReadCtx,
    args: {
      convexAuthUserId: Id<"users"> | undefined | null;
      convexAuthOrganizationId: Id<"organizations"> | undefined | null;
    },
  ) => Promise<ComponentMemberRef | null>;
  listRolesByOrganization: (
    ctx: TReadCtx,
    args: {
      convexAuthOrganizationId: Id<"organizations"> | undefined | null;
      localOrganizationId?: TOrgId;
    },
  ) => Promise<ResolvedComponentRole<TOrgId>[]>;
  getRoleByKey: (
    ctx: TReadCtx,
    args: {
      convexAuthOrganizationId: Id<"organizations"> | undefined | null;
      localOrganizationId?: TOrgId;
      key: string;
    },
  ) => Promise<ResolvedComponentRole<TOrgId> | null>;
  getApiKeyByPrefix: (
    ctx: TReadCtx,
    keyPrefix: string,
  ) => Promise<ResolvedComponentApiKey<TOrgId, TUserId> | null>;
  getApiKeyById: (
    ctx: TReadCtx,
    apiKeyId: Id<"api_keys">,
  ) => Promise<ResolvedComponentApiKey<TOrgId, TUserId> | null>;
  getApiKeyByRequestId: (
    ctx: TReadCtx,
    args: {
      convexAuthOrganizationId: Id<"organizations"> | undefined | null;
      requestId: string;
    },
  ) => Promise<ResolvedComponentApiKey<TOrgId, TUserId> | null>;
  listApiKeysByOrganization: (
    ctx: TReadCtx,
    convexAuthOrganizationId: Id<"organizations"> | undefined | null,
    options?: { status?: ComponentApiKeyStatus; limit?: number },
  ) => Promise<ResolvedComponentApiKey<TOrgId, TUserId>[]>;
  getInvitationByTokenHash: (
    ctx: TReadCtx,
    tokenHash: string,
  ) => Promise<ResolvedComponentInvitation<TOrgId, TUserId, TRole> | null>;
  getInvitationByEmailId: (
    ctx: TReadCtx,
    emailId: string,
  ) => Promise<ResolvedComponentInvitation<TOrgId, TUserId, TRole> | null>;
  listInvitationsByOrganization: (
    ctx: TReadCtx,
    args: {
      convexAuthOrganizationId: Id<"organizations"> | undefined | null;
      status?: ComponentInvitationStatus;
    },
  ) => Promise<ResolvedComponentInvitation<TOrgId, TUserId, TRole>[]>;
};

export type ConvexAuthOrganizationWrites<
  TOrgId,
  TUserId,
  TRole extends string,
  TWriteCtx extends ConvexAuthOperationsWriteCtx = GlueCtx,
> = {
  ensureOrganization: (
    ctx: TWriteCtx,
    localOrganizationId: TOrgId,
    createdByConvexAuthUserId?: Id<"users">,
  ) => Promise<Id<"organizations">>;
  ensureSystemRoles: (
    ctx: TWriteCtx,
    localOrganizationId: TOrgId,
    createdByConvexAuthUserId?: Id<"users">,
  ) => Promise<Id<"organizations">>;
  ensureRoleForTemplate: (
    ctx: TWriteCtx,
    localOrganizationId: TOrgId,
    roleTemplate: TRole,
  ) => Promise<Id<"organization_roles">>;
  upsertMember: (
    ctx: TWriteCtx,
    args: {
      localOrganizationId: TOrgId;
      localUserId: TUserId;
      roleTemplate: TRole;
      status: ComponentMemberStatus;
      invitedBy?: TUserId;
      assignedBy?: TUserId;
      acceptedAt?: number;
    },
  ) => Promise<Id<"organization_members">>;
  createInvitation: (
    ctx: TWriteCtx,
    args: {
      localOrganizationId: TOrgId;
      email: string;
      tokenHash: string;
      roleTemplate: TRole;
      status: ComponentInvitationStatus;
      invitedBy: TUserId;
      expiresAt: number;
    },
  ) => Promise<Id<"organization_invitations">>;
  setInvitationStatus: (
    ctx: TWriteCtx,
    args: {
      invitationId: Id<"organization_invitations">;
      convexAuthOrganizationId: Id<"organizations">;
      status: ComponentInvitationStatus;
      acceptedByUserId?: TUserId;
      acceptedAt?: number;
    },
  ) => Promise<void>;
  recordInvitationEmailDelivery: (
    ctx: TWriteCtx,
    args: {
      invitationId: Id<"organization_invitations">;
      /**
       * The convex-auth organization the caller is authorized for. Bound to the
       * invitation in the component to close a cross-organization IDOR — without
       * it, any invitation could be tampered with by id alone.
       */
      convexAuthOrganizationId: Id<"organizations">;
      emailId?: string | null;
      emailDeliveryStatus: ComponentInvitationEmailDeliveryStatus;
      emailDeliveryEvent?: string | null;
      emailDeliveryError?: string | null;
    },
  ) => Promise<void>;
  createApiKey: (
    ctx: TWriteCtx,
    args: {
      localOrganizationId: TOrgId;
      localUserId: TUserId;
      name: string;
      keyPrefix: string;
      keyHash: string;
      scopes: readonly string[];
      allowedIpRanges?: readonly string[];
      expiresAt?: number;
      requestId?: string;
      requestIdExpiresAt?: number;
      status?: ComponentApiKeyStatus;
    },
  ) => Promise<Id<"api_keys">>;
  rotateApiKey: (
    ctx: TWriteCtx,
    args: {
      apiKeyId: Id<"api_keys">;
      convexAuthOrganizationId: Id<"organizations">;
      keyPrefix: string;
      keyHash: string;
    },
  ) => Promise<void>;
  revokeApiKey: (
    ctx: TWriteCtx,
    args: {
      apiKeyId: Id<"api_keys">;
      convexAuthOrganizationId: Id<"organizations">;
    },
  ) => Promise<void>;
  touchApiKeyLastUsed: (
    ctx: TWriteCtx,
    args: {
      apiKeyId: Id<"api_keys">;
      convexAuthOrganizationId: Id<"organizations">;
      ip?: string | null;
    },
  ) => Promise<void>;
};

export type ConvexAuthOrganizationOperations<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx = GlueCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx = GlueCtx,
> = {
  reads: ConvexAuthOrganizationReads<TOrgId, TUserId, TRole, TReadCtx>;
  writes: ConvexAuthOrganizationWrites<TOrgId, TUserId, TRole, TWriteCtx>;
};

/**
 * Factory
 */

type ConvexAuthOrganizationOperationsRuntime<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx,
> = ConvexAuthOrganizationOperationsConfig<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx> & {
  orgOps: ConvexAuthOrganizationOperationsComponentHandle["organizations"];
  apiKeyOps: ConvexAuthOrganizationOperationsComponentHandle["apiKeys"];
  createOperationsError: (args: ConvexAuthOrganizationOperationsErrorInput) => Error;
};

function createOperationsRuntime<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx,
>(
  config: ConvexAuthOrganizationOperationsConfig<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx>,
): ConvexAuthOrganizationOperationsRuntime<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx> {
  const orgOps = config.component?.organizations ?? config.components!.organizations;
  const apiKeyOps = config.component?.apiKeys ?? config.components!.apiKeys;
  return {
    ...config,
    orgOps,
    apiKeyOps,
    createOperationsError: config.createError ?? defaultCreateOperationsError,
  };
}

function failOperations<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx,
>(
  runtime: ConvexAuthOrganizationOperationsRuntime<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx>,
  args: ConvexAuthOrganizationOperationsErrorInput,
): never {
  throw runtime.createOperationsError(args);
}

function requireRunMutation<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx,
>(
  runtime: ConvexAuthOrganizationOperationsRuntime<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx>,
  ctx: TWriteCtx,
): NonNullable<TWriteCtx["runMutation"]> {
  if (typeof ctx.runMutation !== "function") {
    failOperations(runtime, {
      code: "missing_run_mutation",
      message:
        "createConvexAuthOrganizationOperations: writer called with a ctx that has no runMutation (use a mutation/action ctx)",
    });
  }
  return ctx.runMutation;
}

async function resolveRoleTemplate<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx,
>(
  runtime: ConvexAuthOrganizationOperationsRuntime<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx>,
  ctx: TReadCtx,
  roleId: Id<"organization_roles">,
  organizationId: Id<"organizations">,
): Promise<TRole | null> {
  const role = await ctx.runQuery(runtime.orgOps.getRole, {
    roleId,
    organizationId,
  });
  if (role === null || !runtime.validateRoleKey(role.key)) {
    return null;
  }
  return role.key;
}

async function mapMembership<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx,
>(
  runtime: ConvexAuthOrganizationOperationsRuntime<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx>,
  ctx: TReadCtx,
  member: ComponentMember,
  knownLocalOrganizationId?: TOrgId,
): Promise<ResolvedComponentMembership<TOrgId, TRole> | null> {
  const organizationId =
    knownLocalOrganizationId ??
    (await runtime.resolveLocalOrganizationId(ctx, member.organizationId));
  if (organizationId === null || organizationId === undefined) {
    return null;
  }
  const roleTemplate = await resolveRoleTemplate(
    runtime,
    ctx,
    member.roleId,
    member.organizationId,
  );
  if (roleTemplate === null) {
    return null;
  }
  return {
    organizationId,
    roleTemplate,
    status: mapMemberStatus(member.status),
    convexAuthMemberId: member._id,
  };
}

async function mapApiKey<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx,
>(
  runtime: ConvexAuthOrganizationOperationsRuntime<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx>,
  ctx: TReadCtx,
  apiKey: ComponentApiKey,
): Promise<ResolvedComponentApiKey<TOrgId, TUserId> | null> {
  if (apiKey.organizationId === undefined || apiKey.userId === undefined) {
    return null;
  }
  const organizationId = await runtime.resolveLocalOrganizationId(ctx, apiKey.organizationId);
  if (organizationId === null) {
    return null;
  }
  const userId = await runtime.resolveLocalUserId(ctx, apiKey.userId);
  if (userId === null) {
    return null;
  }
  return {
    _id: apiKey._id,
    organizationId,
    userId,
    name: apiKey.name,
    keyPrefix: apiKey.keyPrefix,
    keyHash: apiKey.keyHash,
    scopes: apiKey.scopes,
    allowedIpRanges: apiKey.allowedIpRanges,
    expiresAt: apiKey.expiresAt,
    status: apiKey.status,
    requestId: apiKey.requestId,
    requestIdExpiresAt: apiKey.requestIdExpiresAt,
    lastUsedAt: apiKey.lastUsedAt,
    lastUsedIp: apiKey.lastUsedIp,
    createdAt: apiKey.createdAt,
    updatedAt: apiKey.updatedAt,
  };
}

async function mapInvitation<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx,
>(
  runtime: ConvexAuthOrganizationOperationsRuntime<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx>,
  ctx: TReadCtx,
  invitation: ComponentInvitation,
): Promise<ResolvedComponentInvitation<TOrgId, TUserId, TRole> | null> {
  const organizationId = await runtime.resolveLocalOrganizationId(ctx, invitation.organizationId);
  if (organizationId === null) return null;
  const roleTemplate = await resolveRoleTemplate(
    runtime,
    ctx,
    invitation.roleId,
    invitation.organizationId,
  );
  if (roleTemplate === null) return null;
  const invitedBy = await runtime.resolveLocalUserId(ctx, invitation.invitedBy);
  if (invitedBy === null) return null;
  const acceptedByUserId =
    invitation.acceptedByUserId === undefined
      ? undefined
      : ((await runtime.resolveLocalUserId(ctx, invitation.acceptedByUserId)) ?? undefined);

  return {
    _id: invitation._id,
    organizationId,
    email: invitation.email,
    tokenHash: invitation.tokenHash,
    roleTemplate,
    status: invitation.status,
    invitedBy,
    expiresAt: invitation.expiresAt,
    acceptedByUserId,
    acceptedAt: invitation.acceptedAt,
    emailId: invitation.emailId,
    emailDeliveryStatus: invitation.emailDeliveryStatus,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
  };
}

/**
 * Build the typed reader/writer suite for a consumer. Wire it ONCE with the
 * same bridge adapters the glue uses + the consumer's role template guard /
 * catalog / org-row projection; the package owns the orchestration + safety.
 */
export function createConvexAuthOrganizationOperations<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx = GlueCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx = GlueCtx,
>(
  config: ConvexAuthOrganizationOperationsConfig<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx>,
): ConvexAuthOrganizationOperations<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx> {
  const runtime = createOperationsRuntime(config);
  return {
    reads: createConvexAuthOrganizationReads(runtime),
    writes: createConvexAuthOrganizationWrites(runtime),
  };
}

function createConvexAuthOrganizationReads<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx,
>(
  runtime: ConvexAuthOrganizationOperationsRuntime<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx>,
): ConvexAuthOrganizationReads<TOrgId, TUserId, TRole, TReadCtx> {
  return {
    ...createMembershipReads(runtime),
    ...createMemberLookupReads(runtime),
    ...createRoleReads(runtime),
    ...createApiKeyReads(runtime),
    ...createInvitationReads(runtime),
  };
}

function createMembershipReads<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx,
>(
  runtime: ConvexAuthOrganizationOperationsRuntime<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx>,
): Pick<
  ConvexAuthOrganizationReads<TOrgId, TUserId, TRole, TReadCtx>,
  "resolveMemberships" | "resolveMembershipForOrganization" | "listMembersByOrganization"
> {
  return {
    async resolveMemberships(ctx, convexAuthUserId) {
      if (!convexAuthUserId) {
        return [];
      }
      const members = await ctx.runQuery(runtime.orgOps.listMembershipsByUser, {
        userId: convexAuthUserId,
      });
      const resolved = await Promise.all(
        members.map((member) => mapMembership(runtime, ctx, member)),
      );
      return resolved.filter((membership) => membership !== null);
    },

    async resolveMembershipForOrganization(ctx, args) {
      const { convexAuthUserId, convexAuthOrganizationId, knownLocalOrganizationId } = args;
      if (!convexAuthUserId || !convexAuthOrganizationId) {
        return null;
      }
      const member = await ctx.runQuery(runtime.orgOps.getMemberByUserOrganization, {
        userId: convexAuthUserId,
        organizationId: convexAuthOrganizationId,
      });
      if (member === null) {
        return null;
      }
      return await mapMembership(runtime, ctx, member, knownLocalOrganizationId);
    },

    async listMembersByOrganization(ctx, convexAuthOrganizationId, options) {
      if (!convexAuthOrganizationId) {
        return [];
      }
      const members = await ctx.runQuery(runtime.orgOps.listMembersByOrganization, {
        organizationId: convexAuthOrganizationId,
        status: options?.status,
        limit: options?.limit,
      });
      const resolved = await Promise.all(
        members.map(async (member) => {
          const [roleTemplate, userId] = await Promise.all([
            resolveRoleTemplate(runtime, ctx, member.roleId, member.organizationId),
            member.userId === undefined || member.userId === null
              ? Promise.resolve(null)
              : runtime.resolveLocalUserId(ctx, member.userId),
          ]);
          return roleTemplate === null
            ? null
            : {
                memberId: member._id,
                userId,
                roleTemplate,
                status: mapMemberStatus(member.status),
                createdAt: member.createdAt,
                updatedAt: member.updatedAt,
              };
        }),
      );
      return resolved.filter((member) => member !== null);
    },
  };
}

function createMemberLookupReads<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx,
>(
  runtime: ConvexAuthOrganizationOperationsRuntime<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx>,
): Pick<
  ConvexAuthOrganizationReads<TOrgId, TUserId, TRole, TReadCtx>,
  "getMemberById" | "getMemberRefForUserOrganization"
> {
  return {
    async getMemberById(ctx, componentMemberId) {
      const member = await ctx.runQuery(runtime.orgOps.getMemberByIdForSystem, {
        memberId: componentMemberId,
      });
      if (member === null) {
        return null;
      }
      const organizationId = await runtime.resolveLocalOrganizationId(ctx, member.organizationId);
      const userId =
        member.userId === undefined || member.userId === null
          ? null
          : await runtime.resolveLocalUserId(ctx, member.userId);
      const roleTemplate = await resolveRoleTemplate(
        runtime,
        ctx,
        member.roleId,
        member.organizationId,
      );
      return {
        memberId: member._id,
        organizationId,
        userId,
        roleTemplate,
        status: mapMemberStatus(member.status),
        roleId: member.roleId,
        createdAt: member.createdAt,
        updatedAt: member.updatedAt,
      };
    },

    async getMemberRefForUserOrganization(ctx, args) {
      const { convexAuthUserId, convexAuthOrganizationId } = args;
      if (!convexAuthUserId || !convexAuthOrganizationId) {
        return null;
      }
      const member = await ctx.runQuery(runtime.orgOps.getMemberByUserOrganization, {
        userId: convexAuthUserId,
        organizationId: convexAuthOrganizationId,
      });
      if (member === null) {
        return null;
      }
      return { memberId: member._id, roleId: member.roleId };
    },
  };
}

function createRoleReads<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx,
>(
  runtime: ConvexAuthOrganizationOperationsRuntime<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx>,
): Pick<
  ConvexAuthOrganizationReads<TOrgId, TUserId, TRole, TReadCtx>,
  "listRolesByOrganization" | "getRoleByKey"
> {
  return {
    async listRolesByOrganization(ctx, args) {
      const { convexAuthOrganizationId, localOrganizationId } = args;
      if (!convexAuthOrganizationId) {
        return [];
      }
      const roles = await ctx.runQuery(runtime.orgOps.listRolesByOrganization, {
        organizationId: convexAuthOrganizationId,
      });
      const organizationId =
        localOrganizationId ??
        (await runtime.resolveLocalOrganizationId(ctx, convexAuthOrganizationId));
      return roles.map((role) => ({
        roleId: role._id,
        organizationId: organizationId ?? null,
        name: role.key,
        permissions: role.permissions,
        isSystem: role.isSystem,
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      }));
    },

    async getRoleByKey(ctx, args) {
      const { convexAuthOrganizationId, localOrganizationId, key } = args;
      if (!convexAuthOrganizationId) {
        return null;
      }
      const role = await ctx.runQuery(runtime.orgOps.getRoleByKey, {
        organizationId: convexAuthOrganizationId,
        key,
      });
      if (role === null) {
        return null;
      }
      const organizationId =
        localOrganizationId ??
        (await runtime.resolveLocalOrganizationId(ctx, convexAuthOrganizationId));
      return {
        roleId: role._id,
        organizationId: organizationId ?? null,
        name: role.key,
        permissions: role.permissions,
        isSystem: role.isSystem,
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      };
    },
  };
}

function createApiKeyReads<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx,
>(
  runtime: ConvexAuthOrganizationOperationsRuntime<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx>,
): Pick<
  ConvexAuthOrganizationReads<TOrgId, TUserId, TRole, TReadCtx>,
  "getApiKeyByPrefix" | "getApiKeyById" | "getApiKeyByRequestId" | "listApiKeysByOrganization"
> {
  return {
    async getApiKeyByPrefix(ctx, keyPrefix) {
      const apiKey = await ctx.runQuery(runtime.apiKeyOps.getApiKeyByPrefix, {
        keyPrefix,
      });
      if (apiKey === null) {
        return null;
      }
      return await mapApiKey(runtime, ctx, apiKey);
    },

    async getApiKeyById(ctx, apiKeyId) {
      const apiKey = await ctx.runQuery(runtime.apiKeyOps.getApiKey, {
        apiKeyId,
      });
      if (apiKey === null) {
        return null;
      }
      return await mapApiKey(runtime, ctx, apiKey);
    },

    async getApiKeyByRequestId(ctx, args) {
      const { convexAuthOrganizationId, requestId } = args;
      if (!convexAuthOrganizationId) {
        return null;
      }
      const apiKey = await ctx.runQuery(runtime.apiKeyOps.getApiKeyByRequestId, {
        organizationId: convexAuthOrganizationId,
        requestId,
      });
      if (apiKey === null) {
        return null;
      }
      return await mapApiKey(runtime, ctx, apiKey);
    },

    async listApiKeysByOrganization(ctx, convexAuthOrganizationId, options) {
      if (!convexAuthOrganizationId) {
        return [];
      }
      const apiKeys = await ctx.runQuery(runtime.apiKeyOps.listApiKeysByOrganization, {
        organizationId: convexAuthOrganizationId,
        status: options?.status,
        limit: options?.limit,
      });
      const resolved = await Promise.all(apiKeys.map((apiKey) => mapApiKey(runtime, ctx, apiKey)));
      return resolved.filter((apiKey) => apiKey !== null);
    },
  };
}

function createInvitationReads<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx,
>(
  runtime: ConvexAuthOrganizationOperationsRuntime<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx>,
): Pick<
  ConvexAuthOrganizationReads<TOrgId, TUserId, TRole, TReadCtx>,
  "getInvitationByTokenHash" | "getInvitationByEmailId" | "listInvitationsByOrganization"
> {
  return {
    async getInvitationByTokenHash(ctx, tokenHash) {
      const invitation = await ctx.runQuery(runtime.orgOps.getInvitationByTokenHash, {
        tokenHash,
      });
      if (invitation === null) {
        return null;
      }
      return await mapInvitation(runtime, ctx, invitation);
    },

    async getInvitationByEmailId(ctx, emailId) {
      const invitation = await ctx.runQuery(runtime.orgOps.getInvitationByEmailId, {
        emailId,
      });
      if (invitation === null) {
        return null;
      }
      return await mapInvitation(runtime, ctx, invitation);
    },

    async listInvitationsByOrganization(ctx, args) {
      const { convexAuthOrganizationId, status } = args;
      if (!convexAuthOrganizationId) {
        return [];
      }
      const invitations = await ctx.runQuery(runtime.orgOps.listInvitationsByOrganization, {
        organizationId: convexAuthOrganizationId,
        status,
      });
      const resolved = await Promise.all(
        invitations.map((invitation) => mapInvitation(runtime, ctx, invitation)),
      );
      return resolved.filter((invitation) => invitation !== null);
    },
  };
}

async function ensureOrganization<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx,
>(
  runtime: ConvexAuthOrganizationOperationsRuntime<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx>,
  ctx: TWriteCtx,
  localOrganizationId: TOrgId,
  createdByConvexAuthUserId?: Id<"users">,
): Promise<Id<"organizations">> {
  const runMutation = requireRunMutation(runtime, ctx);
  const organization = await runtime.loadOrganizationForUpsert(ctx, localOrganizationId);
  if (organization === null) {
    failOperations(runtime, {
      code: "organization_not_found",
      message:
        "createConvexAuthOrganizationOperations: loadOrganizationForUpsert returned null (organization not found)",
      context: { localOrganizationId: String(localOrganizationId) },
    });
  }
  const result = await runMutation(runtime.orgOps.upsertOrganization, {
    organizationId: organization.convexAuthOrganizationId,
    name: organization.name,
    slug: organization.slug,
    imageUrl: organization.imageUrl ?? null,
    status: organization.status,
    createdBy: createdByConvexAuthUserId,
    metadataJson: organization.metadataJson ?? null,
  });

  if (organization.convexAuthOrganizationId !== result.organizationId) {
    await runtime.backfillOrganizationBridgeId(ctx, localOrganizationId, result.organizationId);
  }
  return result.organizationId;
}

async function ensureRoleForTemplate<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx,
>(
  runtime: ConvexAuthOrganizationOperationsRuntime<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx>,
  ctx: TWriteCtx,
  localOrganizationId: TOrgId,
  roleTemplate: TRole,
): Promise<Id<"organization_roles">> {
  const runMutation = requireRunMutation(runtime, ctx);
  const convexAuthOrganizationId = await ensureOrganization(runtime, ctx, localOrganizationId);
  const result = await runMutation(runtime.orgOps.ensureRole, {
    organizationId: convexAuthOrganizationId,
    key: roleTemplate,
    name: roleTemplate,
    permissions: [...runtime.roleCatalog[roleTemplate]],
    isSystem: true,
  });
  return result.roleId;
}

function createConvexAuthOrganizationWrites<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx,
>(
  runtime: ConvexAuthOrganizationOperationsRuntime<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx>,
): ConvexAuthOrganizationWrites<TOrgId, TUserId, TRole, TWriteCtx> {
  return {
    ...createOrganizationRoleWrites(runtime),
    ...createMemberWrites(runtime),
    ...createInvitationWrites(runtime),
    ...createApiKeyWrites(runtime),
  };
}

function createOrganizationRoleWrites<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx,
>(
  runtime: ConvexAuthOrganizationOperationsRuntime<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx>,
): Pick<
  ConvexAuthOrganizationWrites<TOrgId, TUserId, TRole, TWriteCtx>,
  "ensureOrganization" | "ensureRoleForTemplate" | "ensureSystemRoles"
> {
  return {
    ensureOrganization: (ctx, localOrganizationId, createdByConvexAuthUserId) =>
      ensureOrganization(runtime, ctx, localOrganizationId, createdByConvexAuthUserId),
    ensureRoleForTemplate: (ctx, localOrganizationId, roleTemplate) =>
      ensureRoleForTemplate(runtime, ctx, localOrganizationId, roleTemplate),

    async ensureSystemRoles(ctx, localOrganizationId, createdByConvexAuthUserId) {
      const runMutation = requireRunMutation(runtime, ctx);
      const convexAuthOrganizationId = await ensureOrganization(
        runtime,
        ctx,
        localOrganizationId,
        createdByConvexAuthUserId,
      );
      await runMutation(runtime.orgOps.seedDefaultRoles, {
        organizationId: convexAuthOrganizationId,
        catalog: Object.entries(runtime.roleCatalog).map(([name, permissions]) => {
          if (
            !Array.isArray(permissions) ||
            !permissions.every((permission) => typeof permission === "string")
          ) {
            throw new TypeError(`Invalid permission catalog for role ${name}`);
          }
          return {
            key: name,
            name,
            permissions,
            isSystem: true,
          };
        }),
      });
      return convexAuthOrganizationId;
    },
  };
}

function createMemberWrites<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx,
>(
  runtime: ConvexAuthOrganizationOperationsRuntime<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx>,
): Pick<ConvexAuthOrganizationWrites<TOrgId, TUserId, TRole, TWriteCtx>, "upsertMember"> {
  return {
    async upsertMember(ctx, args) {
      const runMutation = requireRunMutation(runtime, ctx);
      const userBridgeId = await runtime.loadUserBridgeId(ctx, args.localUserId);
      if (userBridgeId === null) {
        failOperations(runtime, {
          code: "user_bridge_id_missing",
          message:
            "createConvexAuthOrganizationOperations: member user is missing convex auth bridge id",
          context: { subject: "member", localUserId: String(args.localUserId) },
        });
      }
      const convexAuthOrganizationId = await ensureOrganization(
        runtime,
        ctx,
        args.localOrganizationId,
        userBridgeId,
      );
      const roleId = await ensureRoleForTemplate(
        runtime,
        ctx,
        args.localOrganizationId,
        args.roleTemplate,
      );
      const result = await runMutation(runtime.orgOps.upsertMember, {
        organizationId: convexAuthOrganizationId,
        userId: userBridgeId,
        roleId,
        status: args.status,
        invitedBy:
          args.invitedBy === undefined
            ? undefined
            : ((await runtime.loadUserBridgeId(ctx, args.invitedBy)) ?? undefined),
        assignedBy:
          args.assignedBy === undefined
            ? undefined
            : ((await runtime.loadUserBridgeId(ctx, args.assignedBy)) ?? undefined),
        acceptedAt: args.acceptedAt,
      });
      return result.memberId;
    },
  };
}

function createInvitationWrites<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx,
>(
  runtime: ConvexAuthOrganizationOperationsRuntime<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx>,
): Pick<
  ConvexAuthOrganizationWrites<TOrgId, TUserId, TRole, TWriteCtx>,
  "createInvitation" | "setInvitationStatus" | "recordInvitationEmailDelivery"
> {
  return {
    async createInvitation(ctx, args) {
      const runMutation = requireRunMutation(runtime, ctx);
      const invitedByBridgeId = await runtime.loadUserBridgeId(ctx, args.invitedBy);
      if (invitedByBridgeId === null) {
        failOperations(runtime, {
          code: "user_bridge_id_missing",
          message:
            "createConvexAuthOrganizationOperations: invitation creator is missing convex auth bridge id",
          context: {
            subject: "invitation_creator",
            localUserId: String(args.invitedBy),
          },
        });
      }
      const convexAuthOrganizationId = await ensureOrganization(
        runtime,
        ctx,
        args.localOrganizationId,
        invitedByBridgeId,
      );
      const roleId = await ensureRoleForTemplate(
        runtime,
        ctx,
        args.localOrganizationId,
        args.roleTemplate,
      );
      const result = await runMutation(runtime.orgOps.upsertInvitation, {
        organizationId: convexAuthOrganizationId,
        roleId,
        email: args.email,
        tokenHash: args.tokenHash,
        status: args.status,
        invitedBy: invitedByBridgeId,
        expiresAt: args.expiresAt,
      });
      return result.invitationId;
    },

    async setInvitationStatus(ctx, args) {
      const runMutation = requireRunMutation(runtime, ctx);
      await runMutation(runtime.orgOps.setInvitationStatus, {
        invitationId: args.invitationId,
        organizationId: args.convexAuthOrganizationId,
        status: args.status,
        acceptedByUserId:
          args.acceptedByUserId === undefined
            ? undefined
            : ((await runtime.loadUserBridgeId(ctx, args.acceptedByUserId)) ?? undefined),
        acceptedAt: args.acceptedAt,
      });
    },

    async recordInvitationEmailDelivery(ctx, args) {
      const runMutation = requireRunMutation(runtime, ctx);
      await runMutation(runtime.orgOps.recordInvitationEmailDelivery, {
        invitationId: args.invitationId,
        organizationId: args.convexAuthOrganizationId,
        emailId: args.emailId ?? null,
        emailDeliveryStatus: args.emailDeliveryStatus,
        emailDeliveryEvent: args.emailDeliveryEvent ?? null,
        emailDeliveryError: args.emailDeliveryError ?? null,
      });
    },
  };
}

function createApiKeyWrites<
  TOrgId,
  TUserId,
  TRole extends string,
  TReadCtx extends ConvexAuthOperationsReadCtx,
  TWriteCtx extends ConvexAuthOperationsWriteCtx,
>(
  runtime: ConvexAuthOrganizationOperationsRuntime<TOrgId, TUserId, TRole, TReadCtx, TWriteCtx>,
): Pick<
  ConvexAuthOrganizationWrites<TOrgId, TUserId, TRole, TWriteCtx>,
  "createApiKey" | "rotateApiKey" | "revokeApiKey" | "touchApiKeyLastUsed"
> {
  return {
    async createApiKey(ctx, args) {
      const runMutation = requireRunMutation(runtime, ctx);
      const userBridgeId = await runtime.loadUserBridgeId(ctx, args.localUserId);
      if (userBridgeId === null) {
        failOperations(runtime, {
          code: "user_bridge_id_missing",
          message:
            "createConvexAuthOrganizationOperations: api key user is missing convex auth bridge id",
          context: {
            subject: "api_key_user",
            localUserId: String(args.localUserId),
          },
        });
      }
      const convexAuthOrganizationId = await ensureOrganization(
        runtime,
        ctx,
        args.localOrganizationId,
        userBridgeId,
      );
      const result = await runMutation(runtime.apiKeyOps.upsertApiKey, {
        organizationId: convexAuthOrganizationId,
        userId: userBridgeId,
        name: args.name,
        keyPrefix: args.keyPrefix,
        keyHash: args.keyHash,
        requestId: args.requestId ?? null,
        requestIdExpiresAt: args.requestIdExpiresAt ?? null,
        scopes: [...args.scopes],
        allowedIpRanges: args.allowedIpRanges ? [...args.allowedIpRanges] : null,
        expiresAt: args.expiresAt ?? null,
        status: args.status ?? "active",
      });
      return result.apiKeyId;
    },

    async rotateApiKey(ctx, args) {
      const runMutation = requireRunMutation(runtime, ctx);
      await runMutation(runtime.apiKeyOps.rotateApiKey, {
        apiKeyId: args.apiKeyId,
        organizationId: args.convexAuthOrganizationId,
        keyPrefix: args.keyPrefix,
        keyHash: args.keyHash,
      });
    },

    async revokeApiKey(ctx, args) {
      const runMutation = requireRunMutation(runtime, ctx);
      await runMutation(runtime.apiKeyOps.revokeApiKey, {
        apiKeyId: args.apiKeyId,
        organizationId: args.convexAuthOrganizationId,
      });
    },

    async touchApiKeyLastUsed(ctx, args) {
      const runMutation = requireRunMutation(runtime, ctx);
      await runMutation(runtime.apiKeyOps.touchApiKeyLastUsed, {
        apiKeyId: args.apiKeyId,
        organizationId: args.convexAuthOrganizationId,
        ip: args.ip ?? null,
      });
    },
  };
}
