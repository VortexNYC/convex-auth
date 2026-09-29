import { components } from "./_generated/api";
import { env, type MutationCtx, type QueryCtx } from "./_generated/server";

type Ctx = QueryCtx | MutationCtx;

export async function requireCaller(ctx: Ctx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new Error("Authentication required");
  }
  return identity.subject;
}

/**
 * Permission-grant algebra mirroring core/permissions.ts exactly:
 * `permissionGrantMatches` (grant covers concrete need) and
 * `permissionGrantCoversGrant` (grant covers grant — needed for role ceilings
 * where the TARGET may itself carry `*` or `domain:*`).
 *
 * A grant is `*`, `domain:*`, or a concrete `domain:sub:action` key. `*` may
 * be granted but never *required*. `domain:*` is a single-colon wildcard —
 * `a:b:*` is not a valid grant.
 */
const PERMISSION_SEGMENT = /^[A-Za-z0-9._-]+$/;

function isConcretePermission(permission: string): boolean {
  return (
    permission.length > 0 &&
    !permission.includes("*") &&
    permission.split(":").every((s) => PERMISSION_SEGMENT.test(s))
  );
}

function isDomainWildcard(permission: string): boolean {
  const wildcard = permission.indexOf(":*");
  return (
    wildcard > 0 &&
    wildcard === permission.length - 2 &&
    permission.indexOf(":") === wildcard &&
    PERMISSION_SEGMENT.test(permission.slice(0, wildcard))
  );
}

function isPermissionGrant(permission: string): boolean {
  return permission === "*" || isDomainWildcard(permission) || isConcretePermission(permission);
}

/** Grant covers grant: `*` covers everything; `domain:*` covers concrete keys
 * inside that domain; exact covers exact. The right relation for
 * role-assignment ceilings where target permissions may include wildcards. */
export function grantCoversGrant(grant: string, candidate: string): boolean {
  if (!isPermissionGrant(grant) || !isPermissionGrant(candidate)) return false;
  if (grant === "*" || grant === candidate) return true;
  if (!isDomainWildcard(grant) || !isConcretePermission(candidate)) {
    return false;
  }
  const colon = candidate.indexOf(":");
  return colon > 0 && grant.slice(0, -2) === candidate.slice(0, colon);
}

/** Grant covers concrete need: `permissionGranted(["*"], p)` holds for any
 * concrete p, but `permissionGranted(perms, "*")` is always false — `*` can
 * never appear as a required permission. */
export function permissionGranted(grants: readonly string[], needed: string): boolean {
  if (!isConcretePermission(needed)) return false;
  return grants.some((grant) => grantCoversGrant(grant, needed));
}

/**
 * TEST-ONLY seam for the e2e fixture: the webhook write paths mint real
 * outbound fetches, so they additionally require ENABLE_WEBHOOK_PROOFS on the
 * deployment. Without it the functions fail closed — copy nothing from this
 * file into a real app.
 */
export async function requireProofCaller(ctx: Ctx): Promise<string> {
  if (env.ENABLE_WEBHOOK_PROOFS !== "true") {
    throw new Error("Webhook proof functions are disabled");
  }
  const userId = await requireCaller(ctx);
  const user = await ctx.runQuery(components.convexAuth.native.users.getUserById, {
    userId,
  });
  if (user === null || user.isAnonymous === true) {
    throw new Error("Webhook proof functions require a real (non-anonymous) account");
  }
  return userId;
}
