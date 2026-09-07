import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import type {
  FunctionVisibility,
  GenericDataModel,
  MutationBuilder,
  QueryBuilder,
} from "convex/server";

import type {
  B2BGlue,
  B2BViewer,
  GlueAnchorMinimum,
  GlueCtx,
  GlueUserMinimum,
} from "../glue/types";

export type CreateConvexAuthFunctionsOptions<
  TUser extends GlueUserMinimum,
  TAnchor extends GlueAnchorMinimum,
  DataModel extends GenericDataModel,
  QVisibility extends FunctionVisibility,
  MVisibility extends FunctionVisibility,
> = {
  glue: B2BGlue<TUser, TAnchor>;
  query: QueryBuilder<DataModel, QVisibility>;
  mutation: MutationBuilder<DataModel, MVisibility>;
  onAuthorizationDenied?: (
    ctx: GlueCtx,
    args: {
      permission?: string;
      error: unknown;
      viewer?: B2BViewer<TUser, TAnchor>;
    },
  ) => Promise<void> | void;
};

/**
 * Consumer-facing ergonomic auth wrappers built on a B2B `createConvexAuthGlue`.
 *
 * The security invariant: **the secure path is the ONLY path.** A consumer
 * using `permissionMutation("x:y")` cannot write a handler that skips the org +
 * RBAC check — the permission is a PARAMETER of the builder, enforced in
 * `customCtx` BEFORE the handler body runs, and the handler receives a
 * pre-authorized `ctx.viewer`. There is no decision object the handler must
 * remember to check, and no way to reach the db as an unauthorized principal.
 *
 * Org access is ALWAYS permission-based RBAC. The builders gate on
 * `viewer.requirePermission("x:y")` (which checks `membership.permissions`),
 * NEVER on raw role strings — that's the role-only anti-pattern the survey forbids.
 *
 * This is a thin, typed layer ON TOP of the canonical glue — not a fork. The
 * glue's `B2BViewer` already does the RBAC decision; the only missing piece was
 * the wrapper that runs it pre-handler and injects the viewer.
 *
 * Usage (consumer builds once, against its own `query`/`mutation`):
 *
 *   const { permissionMutation, permissionQuery, authedQuery, authedMutation } =
 *     createConvexAuthFunctions({ glue: canonicalAuth, query, mutation });
 *
 *   export const setRole = permissionMutation("users:roles")({
 *     args: { memberId: v.string(), role: v.string() },
 *     handler: async (ctx, args) => {
 *       const orgId = ctx.viewer.convexAuthOrganizationId; // pre-authorized
 *       // ...pure business logic
 *     },
 *   });
 */
export function createConvexAuthFunctions<
  TUser extends GlueUserMinimum,
  TAnchor extends GlueAnchorMinimum,
  DataModel extends GenericDataModel,
  QVisibility extends FunctionVisibility,
  MVisibility extends FunctionVisibility,
>(opts: CreateConvexAuthFunctionsOptions<TUser, TAnchor, DataModel, QVisibility, MVisibility>) {
  const { gate, gateAll, gateAny, gateRole, inject } = createConvexAuthFunctionGates(opts);

  return {
    authedQuery: customQuery(opts.query, inject),
    authedMutation: customMutation(opts.mutation, inject),
    permissionQuery: (permission: string) => customQuery(opts.query, gate(permission)),
    permissionMutation: (permission: string) => customMutation(opts.mutation, gate(permission)),
    permissionAnyQuery: (permissions: readonly string[]) =>
      customQuery(opts.query, gateAny(permissions)),
    permissionAnyMutation: (permissions: readonly string[]) =>
      customMutation(opts.mutation, gateAny(permissions)),
    permissionAllQuery: (permissions: readonly string[]) =>
      customQuery(opts.query, gateAll(permissions)),
    permissionAllMutation: (permissions: readonly string[]) =>
      customMutation(opts.mutation, gateAll(permissions)),
    adminQuery: customQuery(opts.query, gateRole(["owner", "admin"])),
    adminMutation: customMutation(opts.mutation, gateRole(["owner", "admin"])),
    roleQuery: (...roleKeys: string[]) => customQuery(opts.query, gateRole(roleKeys)),
    roleMutation: (...roleKeys: string[]) => customMutation(opts.mutation, gateRole(roleKeys)),
  };
}

function createConvexAuthFunctionGates<
  TUser extends GlueUserMinimum,
  TAnchor extends GlueAnchorMinimum,
  DataModel extends GenericDataModel,
  QVisibility extends FunctionVisibility,
  MVisibility extends FunctionVisibility,
>(opts: CreateConvexAuthFunctionsOptions<TUser, TAnchor, DataModel, QVisibility, MVisibility>) {
  type V = B2BViewer<TUser, TAnchor>;

  const guardWith = async (
    ctx: GlueCtx,
    check?: (viewer: V) => void,
    label?: string,
  ): Promise<V> => {
    let resolved: V | undefined;
    try {
      const viewer = await opts.glue.resolveViewer(ctx);
      resolved = viewer;
      check?.(viewer);
      return viewer;
    } catch (error) {
      await opts.onAuthorizationDenied?.(ctx, {
        permission: label,
        error,
        viewer: resolved,
      });
      throw error;
    }
  };

  const customCtxGate = (check?: (viewer: V) => void, label?: string) =>
    customCtx(
      async (ctx: GlueCtx): Promise<{ viewer: V }> => ({
        viewer: await guardWith(ctx, check, label),
      }),
    );

  return {
    inject: customCtxGate(),
    gate: (permission: string) =>
      customCtxGate((viewer) => viewer.requirePermission(permission), permission),
    gateAny: (permissions: readonly string[]) =>
      customCtxGate(
        (viewer) => requireAnyPermission(viewer, permissions),
        permissions.join(" OR "),
      ),
    gateAll: (permissions: readonly string[]) =>
      customCtxGate(
        (viewer) => requireAllPermissions(viewer, permissions),
        permissions.join(" AND "),
      ),
    gateRole: (roleKeys: readonly string[]) =>
      customCtxGate((viewer) => viewer.requireRole(...roleKeys), `role:[${roleKeys.join(",")}]`),
  };
}

function requireAnyPermission<TUser extends GlueUserMinimum, TAnchor extends GlueAnchorMinimum>(
  viewer: B2BViewer<TUser, TAnchor>,
  permissions: readonly string[],
): void {
  if (!permissions.some((permission) => viewer.hasPermission(permission))) {
    viewer.requirePermission(permissions[0] ?? "");
  }
}

function requireAllPermissions<TUser extends GlueUserMinimum, TAnchor extends GlueAnchorMinimum>(
  viewer: B2BViewer<TUser, TAnchor>,
  permissions: readonly string[],
): void {
  for (const permission of permissions) {
    viewer.requirePermission(permission);
  }
}
