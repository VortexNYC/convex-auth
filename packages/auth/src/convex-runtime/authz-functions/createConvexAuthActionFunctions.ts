import { hasPermission } from "../../compat/permissions";
import { customAction, customCtx } from "convex-helpers/server/customFunctions";
import type {
  ActionBuilder,
  FunctionVisibility,
  GenericActionCtx,
  GenericDataModel,
} from "convex/server";

import { throwAuthError } from "../glue/throwAuthError";

/**
 * Increment 5b-action — permission-gated ACTIONS.
 *
 * The sibling of `createConvexAuthFunctions` for the action surface. Actions
 * cannot read the db, so they cannot run the glue's `resolveViewer` directly;
 * every consumer hand-rolls the gate at the top of each public action instead
 * (some consumers' action code repeats an identity→membership→role check
 * across 7+ money-touching actions; other consumers' payment actions only check identity
 * — UNDER-gated). That in-handler gate is exactly the skippable, drift-prone
 * surface the wrapper-factory closes for queries/mutations.
 *
 * This closes it for actions. The consumer supplies an internal query that runs
 * the glue and returns a serializable {@link ActionAuthSnapshot}; the factory
 * reconstructs a lightweight {@link ActionViewer}, runs the RBAC check BEFORE
 * the handler, and injects the viewer. The permission/role is a PARAMETER of the
 * builder — unbypassable, never a handler line.
 *
 * Usage (consumer wires the snapshot query once):
 *
 *   export const getAuthSnapshot = internalQuery({ handler: async (ctx) => {
 *     const v = await canonicalAuth.resolveViewer(ctx);
 *     return { userId: String(v.user._id), organizationId: String(v.anchor._id),
 *              convexAuthOrganizationId: v.convexAuthOrganizationId,
 *              role: v.membership.roleKey, permissions: v.membership.permissions };
 *   }});
 *
 *   const { permissionAction, roleAction } = createConvexAuthActionFunctions({
 *     action,
 *     resolveAuthSnapshot: (ctx) => ctx.runQuery(internal.auth.getAuthSnapshot),
 *     onAuthorizationDenied,
 *   });
 *
 *   export const createConnectedAccount = permissionAction("billing:manage")({
 *     args: { ... },
 *     handler: async (ctx, args) => { const orgId = ctx.viewer.organizationId; ... },
 *   });
 */

/** Serializable auth data the consumer's snapshot query returns (db-resolved in a query ctx). */
export type ActionAuthSnapshot<TRole extends string = string> = {
  userId: string;
  organizationId: string;
  convexAuthOrganizationId?: string;
  role: TRole;
  /** Permissions AFTER role expansion (the glue returns them already expanded). */
  permissions: readonly string[];
};

/** The pre-authorized viewer injected into a gated action handler. */
export type ActionViewer<TRole extends string = string> = {
  userId: string;
  organizationId: string;
  convexAuthOrganizationId?: string;
  role: TRole;
  permissions: readonly string[];
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: readonly string[]) => boolean;
  hasAllPermissions: (permissions: readonly string[]) => boolean;
  requirePermission: (permission: string) => void;
  requireRole: (...roleKeys: string[]) => void;
};

export type CreateConvexAuthActionFunctionsOptions<
  DataModel extends GenericDataModel,
  AVisibility extends FunctionVisibility,
  TRole extends string,
> = {
  action: ActionBuilder<DataModel, AVisibility>;
  /**
   * Resolve the auth snapshot for the current action. Typically
   * `(ctx) => ctx.runQuery(internal.auth.getAuthSnapshot)`, where that internal
   * query runs the glue's `resolveViewer`. Return `null` for an unauthenticated
   * caller → the gate throws `AUTHENTICATION_REQUIRED`.
   */
  resolveAuthSnapshot: (
    ctx: GenericActionCtx<DataModel>,
  ) => Promise<ActionAuthSnapshot<TRole> | null>;
  /** Same baked denial observer as the query/mutation factory (see createConvexAuthFunctions). */
  onAuthorizationDenied?: (
    ctx: GenericActionCtx<DataModel>,
    args: { permission?: string; error: unknown; viewer?: ActionViewer<TRole> },
  ) => Promise<void> | void;
};

function buildActionViewer<TRole extends string>(
  snapshot: ActionAuthSnapshot<TRole>,
): ActionViewer<TRole> {
  const has = (permission: string): boolean => hasPermission(snapshot.permissions, permission);
  return {
    userId: snapshot.userId,
    organizationId: snapshot.organizationId,
    convexAuthOrganizationId: snapshot.convexAuthOrganizationId,
    role: snapshot.role,
    permissions: snapshot.permissions,
    hasPermission: has,
    hasAnyPermission: (permissions) => permissions.some(has),
    hasAllPermissions: (permissions) => permissions.every(has),
    requirePermission: (permission) => {
      if (!has(permission)) {
        throwAuthError("FORBIDDEN", "PERMISSION_REQUIRED", `Permission required: ${permission}`);
      }
    },
    requireRole: (...roleKeys) => {
      if (!roleKeys.includes(snapshot.role)) {
        throwAuthError(
          "FORBIDDEN",
          "PERMISSION_REQUIRED",
          `Role required: one of [${roleKeys.join(", ")}]`,
        );
      }
    },
  };
}

export function createConvexAuthActionFunctions<
  DataModel extends GenericDataModel,
  AVisibility extends FunctionVisibility,
  TRole extends string = string,
>(opts: CreateConvexAuthActionFunctionsOptions<DataModel, AVisibility, TRole>) {
  // Resolve → check → inject, routing any failure through the denial hook before
  // re-throwing. `resolved` is captured so a permission denial (which happens
  // AFTER resolution) can be attributed to the authenticated principal.
  const guard = async (
    ctx: GenericActionCtx<DataModel>,
    check?: (viewer: ActionViewer<TRole>) => void,
    label?: string,
  ): Promise<ActionViewer<TRole>> => {
    let resolved: ActionViewer<TRole> | undefined;
    try {
      const snapshot = await opts.resolveAuthSnapshot(ctx);
      if (snapshot === null) {
        throwAuthError("UNAUTHORIZED", "AUTHENTICATION_REQUIRED", "Authentication required");
      }
      const viewer = buildActionViewer(snapshot);
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

  const gate = (check?: (viewer: ActionViewer<TRole>) => void, label?: string) =>
    customCtx(
      async (ctx: GenericActionCtx<DataModel>): Promise<{ viewer: ActionViewer<TRole> }> => ({
        viewer: await guard(ctx, check, label),
      }),
    );

  return {
    authedAction: customAction(opts.action, gate()),
    permissionAction: (permission: string) =>
      customAction(
        opts.action,
        gate((viewer) => viewer.requirePermission(permission), permission),
      ),
    permissionAnyAction: (permissions: readonly string[]) =>
      customAction(
        opts.action,
        gate((viewer) => {
          if (!permissions.some((permission) => viewer.hasPermission(permission))) {
            viewer.requirePermission(permissions[0] ?? "");
          }
        }, permissions.join(" OR ")),
      ),
    permissionAllAction: (permissions: readonly string[]) =>
      customAction(
        opts.action,
        gate((viewer) => {
          for (const permission of permissions) {
            viewer.requirePermission(permission);
          }
        }, permissions.join(" AND ")),
      ),
    roleAction: (...roleKeys: string[]) =>
      customAction(
        opts.action,
        gate((viewer) => viewer.requireRole(...roleKeys), `role:[${roleKeys.join(",")}]`),
      ),
  };
}
