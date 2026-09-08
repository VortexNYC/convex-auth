export type PermissionCatalog = Readonly<Record<string, unknown>> | readonly string[];

export type RoleTemplateMap<RoleName extends string = string> = Record<RoleName, readonly string[]>;

const PERMISSION_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

export function hasPermission(
  userPermissions: readonly string[],
  requiredPermission: string,
): boolean {
  if (!isConcretePermission(requiredPermission)) return false;

  return userPermissions.some((grant) => permissionGrantMatches(grant, requiredPermission));
}

export function hasAnyPermission(
  userPermissions: readonly string[],
  requiredPermissions: readonly string[],
): boolean {
  return requiredPermissions.some((permission) => hasPermission(userPermissions, permission));
}

export function hasAllPermissions(
  userPermissions: readonly string[],
  requiredPermissions: readonly string[],
): boolean {
  return requiredPermissions.every((permission) => hasPermission(userPermissions, permission));
}

export function getExpandedPermissions<RoleName extends string>(
  permissionCatalog: PermissionCatalog,
  roleTemplates: RoleTemplateMap<RoleName>,
  role: RoleName,
): string[] {
  return expandPermissionGrants(permissionCatalog, roleTemplates[role]);
}

export function expandPermissionGrants(
  permissionCatalog: PermissionCatalog,
  grants: readonly string[],
): string[] {
  const catalog = Array.isArray(permissionCatalog)
    ? permissionCatalog
    : Object.keys(permissionCatalog);
  const catalogSet = new Set(catalog.filter(isConcretePermission));
  const permissions = new Set<string>();

  for (const permission of grants) {
    if (permission === "*") {
      for (const key of catalogSet) {
        permissions.add(key);
      }
      continue;
    }

    if (isDomainWildcard(permission)) {
      const domain = permission.slice(0, -2);
      for (const key of catalogSet) {
        if (key.startsWith(`${domain}:`)) {
          permissions.add(key);
        }
      }
      continue;
    }

    if (catalogSet.has(permission)) {
      permissions.add(permission);
    }
  }

  return Array.from(permissions);
}

/**
 * Intersect two grant sets without widening either side. The returned grants
 * describe only permissions authorized by BOTH inputs.
 */
export function intersectPermissions(left: readonly string[], right: readonly string[]): string[] {
  const intersection = new Set<string>();

  for (const leftGrant of left) {
    for (const rightGrant of right) {
      if (permissionGrantCoversGrant(leftGrant, rightGrant)) {
        intersection.add(rightGrant);
      } else if (permissionGrantCoversGrant(rightGrant, leftGrant)) {
        intersection.add(leftGrant);
      }
    }
  }

  return [...intersection];
}

function permissionGrantCoversGrant(grant: string, candidate: string): boolean {
  if (!isPermissionGrant(grant) || !isPermissionGrant(candidate)) return false;
  if (grant === "*" || grant === candidate) return true;
  if (!isDomainWildcard(grant) || !isConcretePermission(candidate)) {
    return false;
  }

  const colon = candidate.indexOf(":");
  return colon > 0 && grant.slice(0, -2) === candidate.slice(0, colon);
}

function permissionGrantMatches(grant: string, required: string): boolean {
  if (!isPermissionGrant(grant) || !isConcretePermission(required)) {
    return false;
  }
  if (grant === "*" || grant === required) return true;
  if (!isDomainWildcard(grant)) return false;

  const colon = required.indexOf(":");
  return colon > 0 && grant.slice(0, -2) === required.slice(0, colon);
}

function isPermissionGrant(permission: string): boolean {
  return permission === "*" || isDomainWildcard(permission) || isConcretePermission(permission);
}

function isDomainWildcard(permission: string): boolean {
  const wildcard = permission.indexOf(":*");
  return (
    wildcard > 0 &&
    wildcard === permission.length - 2 &&
    permission.indexOf(":") === wildcard &&
    isPermissionSegment(permission.slice(0, wildcard))
  );
}

function isConcretePermission(permission: string): boolean {
  if (permission.length === 0 || permission.includes("*")) return false;
  return permission.split(":").every(isPermissionSegment);
}

function isPermissionSegment(segment: string): boolean {
  return PERMISSION_SEGMENT_PATTERN.test(segment);
}
