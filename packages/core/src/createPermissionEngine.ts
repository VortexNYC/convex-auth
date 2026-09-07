/**
 * Increment 5a — the wildcard permission engine.
 *
 * The authorization KERNEL, owned by the package. Every consumer otherwise
 * re-implements the identical 3-tier wildcard matcher + role expander (one consumer's
 * `src/domain/permissions.ts`, another consumer's `convex/auth/permissions.ts`, …). A
 * hand-rolled matcher is a security hole waiting to happen — a subtly wrong
 * `hasPermission` over-grants. This defines the semantics ONCE:
 *
 *   - `hasPermission`: `"*"` (super) → exact → `"domain:*"` (domain wildcard).
 *   - `expandPermissions(role)`: resolve a role's `"*"` / `"domain:*"` grants
 *     into concrete registry keys; a grant not in the registry is DROPPED (never
 *     invent a permission).
 *
 * Wire `engine.hasPermission` / `engine.expandPermissions` into
 * `buildOrganizationPermissionContext` and the glue's `expandPermissions`, and
 * the consumer's hand-rolled matcher disappears.
 */

import {
  expandPermissionGrants,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
} from "./permissions";

/** The universe of concrete permission keys — as a registry map or a key list. */
export type PermissionEngineRegistry = Readonly<Record<string, unknown>> | readonly string[];

/** A role's grants — a list (may contain `"*"` / `"domain:*"`) or `{ permissions }`. */
export type PermissionEngineRoleGrants =
  | readonly string[]
  | { readonly permissions: readonly string[] };

export type PermissionEngineRoleCatalog<TRole extends string> = Readonly<
  Record<TRole, PermissionEngineRoleGrants>
>;

export type CreatePermissionEngineConfig<TRole extends string> = {
  registry: PermissionEngineRegistry;
  roleCatalog: PermissionEngineRoleCatalog<TRole>;
};

export type PermissionEngine<TRole extends string> = {
  /** `"*"` → exact → `"domain:*"`. Registry-free string matching on what the user HAS. */
  hasPermission(userPermissions: readonly string[], required: string): boolean;
  /** True if the user is granted ANY of the required permissions. */
  hasAnyPermission(userPermissions: readonly string[], required: readonly string[]): boolean;
  /** True only if the user is granted ALL of the required permissions. */
  hasAllPermissions(userPermissions: readonly string[], required: readonly string[]): boolean;
  /** Expand a role's grants into concrete registry keys (`"*"`/`"domain:*"` resolved). */
  expandPermissions(role: TRole): readonly string[];
};

export function createPermissionEngine<TRole extends string>(
  config: CreatePermissionEngineConfig<TRole>,
): PermissionEngine<TRole> {
  function roleGrants(role: TRole): readonly string[] {
    const entry = config.roleCatalog[role];
    return "permissions" in entry ? entry.permissions : entry;
  }

  function expandPermissions(role: TRole): readonly string[] {
    return expandPermissionGrants(config.registry, roleGrants(role));
  }

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    expandPermissions,
  };
}
