/**
 * Compile-time proof for Increment-3 follow-up A (narrow ops ctx).
 *
 * Proves that a consumer can wire `createConvexAuthOrganizationOperations` with
 * its REAL Convex `GenericQueryCtx` / `GenericMutationCtx` — NO `auth` field, a
 * properly typed `ctx.db` — and:
 *   1. the suite accepts those ctx types (the factory no longer demands `GlueCtx`
 *      with its `auth` requirement) — so the consumer drops the `asGlueCtx` cast;
 *   2. inside every callback `ctx.db` is the consumer's real
 *      `GenericDatabaseReader` / `GenericDatabaseWriter`, NOT `unknown` — so the
 *      consumer drops the `(ctx as OpsCtx).db` re-cast;
 *   3. the suite methods accept the consumer's real ctx WITHOUT a cast.
 *
 * If Convex's `runQuery`/`runMutation` generic signatures ever stop satisfying
 * the `ConvexAuthOperations*Ctx` constraint, this file stops compiling — which
 * is the point: it catches the regression here, not in a consumer migration.
 *
 * Type-only (no runtime assertions).
 */
import { defineSchema, defineTable } from "convex/server";
import type {
  DataModelFromSchemaDefinition,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import { v } from "convex/values";

import type { ComponentApi as ApiKeysComponentApi } from "../../component/apiKeys/_generated/component";
import type { ComponentApi as CoreComponentApi } from "../../component/core/_generated/component";
import type { ComponentApi as OrganizationsComponentApi } from "../../component/organizations/_generated/component";
import {
  createConvexAuthOrganizationOperations,
  type ConvexAuthOrganizationOperationsComponentHandle,
  type ConvexAuthOrganizationOperationsComponentsHandle,
} from "./createConvexAuthOrganizationOperations";

/* A throwaway consumer DataModel, mirroring `_generated/server`. */
const schema = defineSchema({
  organizations: defineTable({
    name: v.string(),
    convexAuthOrganizationId: v.string(),
  }),
  users: defineTable({ convexAuthUserId: v.string() }),
});
type DM = DataModelFromSchemaDefinition<typeof schema>;

/** The consumer's REAL ctx types — note: NO `auth` is required by the suite. */
type QueryCtx = GenericQueryCtx<DM>;
type MutationCtx = GenericMutationCtx<DM>;

type LocalOrgId = string & { readonly __brand: "LocalOrgId" };
type LocalUserId = string & { readonly __brand: "LocalUserId" };
type TestRole = "owner" | "admin" | "member";

/** --- assertion helpers --------------------------------------------------- */
type Expect<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

declare const component: ConvexAuthOrganizationOperationsComponentHandle;

const ops = createConvexAuthOrganizationOperations<
  LocalOrgId,
  LocalUserId,
  TestRole,
  QueryCtx,
  MutationCtx
>({
  component,
  /** -- read callbacks get the consumer's REAL query ctx, no cast -- */
  resolveLocalOrganizationId: async (ctx, _componentOrganizationId) => {
    /* ctx.db is the typed reader — proven below, used here without a cast. */
    const typedReader: QueryCtx["db"] = ctx.db;
    await typedReader.query("organizations").take(1);
    return null;
  },
  resolveLocalUserId: async (ctx, _componentUserId) => {
    await ctx.db.query("users").take(1);
    return null;
  },
  validateRoleKey: (key): key is TestRole => key === "owner" || key === "admin" || key === "member",
  roleCatalog: { owner: ["*"], admin: ["org:read"], member: ["org:read"] },
  /** -- write callbacks get the consumer's REAL mutation ctx, no cast -- */
  loadOrganizationForUpsert: async (ctx, _localOrganizationId) => {
    /* ctx.db is the typed WRITER (insert/patch available) — no cast. */
    const typedWriter: MutationCtx["db"] = ctx.db;
    await typedWriter.query("organizations").take(1);
    return null;
  },
  backfillOrganizationBridgeId: async (ctx, _localOrganizationId, componentOrganizationId) => {
    /** writer-only side effect, ctx.db.patch is reachable without a cast. */
    void ctx.db;
    void componentOrganizationId;
  },
  loadUserBridgeId: async (ctx, _localUserId) => {
    void ctx.db;
    return null;
  },
});

/** The suite methods accept the consumer's REAL ctx with NO cast (no `asGlueCtx`). */
export type QueryCtxAccepted = Expect<
  Equal<QueryCtx extends Parameters<typeof ops.reads.resolveMemberships>[0] ? true : false, true>
>;
export type MutationCtxAccepted = Expect<
  Equal<
    MutationCtx extends Parameters<typeof ops.writes.ensureOrganization>[0] ? true : false,
    true
  >
>;

/** Default (no ctx type args) still resolves to GlueCtx — back-compat guard. */
type DefaultOps = ReturnType<
  typeof createConvexAuthOrganizationOperations<LocalOrgId, LocalUserId, TestRole>
>;
type DefaultReadCtx = Parameters<DefaultOps["reads"]["resolveMemberships"]>[0];
export type DefaultRequiresAuth = Expect<
  Equal<DefaultReadCtx extends { auth: unknown } ? true : false, true>
>;

/**
 * --- split-component bag guard ------------------------------------------------
 * Compile-time proof that the factory can be wired with the independently
 * mounted `core`, `organizations`, and `apiKeys` components (architecture A).
 */
declare const coreComponent: CoreComponentApi<"convexAuthCore">;
declare const organizationsComponent: OrganizationsComponentApi<"convexAuthOrganizations">;
declare const apiKeysComponent: ApiKeysComponentApi<"convexAuthApiKeys">;

const splitHandle: ConvexAuthOrganizationOperationsComponentsHandle = {
  core: { identity: { getByIdentity: coreComponent.identity.getByIdentity } },
  organizations: organizationsComponent.organizations,
  apiKeys: apiKeysComponent.apiKeys,
};

const splitOps = createConvexAuthOrganizationOperations<LocalOrgId, LocalUserId, TestRole>({
  components: splitHandle,
  resolveLocalOrganizationId: async () => null,
  resolveLocalUserId: async () => null,
  validateRoleKey: (key): key is TestRole => key === "owner" || key === "admin" || key === "member",
  roleCatalog: { owner: ["*"], admin: ["org:read"], member: ["org:read"] },
  loadOrganizationForUpsert: async () => null,
  backfillOrganizationBridgeId: async () => {
    /* no-op */
  },
  loadUserBridgeId: async () => null,
});

export type SplitOpsCompiles = Expect<
  Equal<typeof splitOps extends DefaultOps ? true : false, true>
>;
