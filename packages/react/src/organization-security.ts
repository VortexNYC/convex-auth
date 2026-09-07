/**
 * Suite organization security policy (VOR-183).
 *
 * Stored on the convex-auth organization as `metadataJson.security` so every
 * consumer reads/writes the same shape. Consumer-only API IP allowlist /
 * allowApiAccess stay on the consumer org row.
 */

export type ConvexOrganizationSecurity = {
  /** When true, members must have account TOTP enabled to use this org. */
  requireMfa?: boolean;
  /**
   * Max session age in minutes for org-scoped access.
   * Undefined = platform Better Auth default (no org-specific cap).
   * Valid range when set: 15–1440.
   */
  sessionTimeoutMinutes?: number;
};

/** Key under organization `metadataJson` for suite security policy. */
export const ORGANIZATION_SECURITY_METADATA_KEY = "security" as const;

export const ORGANIZATION_SESSION_TIMEOUT_MIN = 15;
export const ORGANIZATION_SESSION_TIMEOUT_MAX = 1440;

type MetadataRecord = Record<string, unknown>;

function isRecord(value: unknown): value is MetadataRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalTimeoutMinutes(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  const rounded = Math.round(value);
  if (rounded < ORGANIZATION_SESSION_TIMEOUT_MIN || rounded > ORGANIZATION_SESSION_TIMEOUT_MAX) {
    return undefined;
  }
  return rounded;
}

function parseSecurityObject(value: unknown): ConvexOrganizationSecurity | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const security: ConvexOrganizationSecurity = {
    ...(optionalBoolean(value.requireMfa) !== undefined
      ? { requireMfa: optionalBoolean(value.requireMfa) }
      : {}),
    ...(optionalTimeoutMinutes(value.sessionTimeoutMinutes) !== undefined
      ? {
          sessionTimeoutMinutes: optionalTimeoutMinutes(value.sessionTimeoutMinutes),
        }
      : {}),
  };
  return Object.keys(security).length > 0 ? security : undefined;
}

/**
 * Read suite security policy from organization `metadataJson`.
 */
export function parseOrganizationSecurityFromMetadataJson(
  metadataJson: string | null | undefined,
): ConvexOrganizationSecurity | undefined {
  if (!metadataJson || metadataJson.trim() === "") {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(metadataJson);
    if (!isRecord(parsed)) {
      return undefined;
    }
    return parseSecurityObject(parsed[ORGANIZATION_SECURITY_METADATA_KEY]);
  } catch {
    return undefined;
  }
}

export type ConvexOrganizationSecurityUpdate = {
  requireMfa?: boolean | null;
  sessionTimeoutMinutes?: number | null;
};

function applySecurityUpdate(
  current: ConvexOrganizationSecurity | undefined,
  update: ConvexOrganizationSecurityUpdate,
): ConvexOrganizationSecurity | undefined {
  const next: ConvexOrganizationSecurity = { ...current };

  if ("requireMfa" in update) {
    if (update.requireMfa === null || update.requireMfa === undefined) {
      delete next.requireMfa;
    } else {
      next.requireMfa = update.requireMfa;
    }
  }

  if ("sessionTimeoutMinutes" in update) {
    if (update.sessionTimeoutMinutes === null || update.sessionTimeoutMinutes === undefined) {
      delete next.sessionTimeoutMinutes;
    } else {
      const minutes = optionalTimeoutMinutes(update.sessionTimeoutMinutes);
      if (minutes === undefined) {
        throw new Error(
          `sessionTimeoutMinutes must be between ${ORGANIZATION_SESSION_TIMEOUT_MIN} and ${ORGANIZATION_SESSION_TIMEOUT_MAX}`,
        );
      }
      next.sessionTimeoutMinutes = minutes;
    }
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Merge a security policy patch into existing organization `metadataJson`.
 * Pass `null` field values to clear. Returns `undefined` when the result
 * would be empty metadata (caller should clear the column).
 */
export function mergeOrganizationSecurityIntoMetadataJson(
  metadataJson: string | null | undefined,
  securityUpdate: ConvexOrganizationSecurityUpdate,
): string | undefined {
  let base: MetadataRecord = {};
  if (metadataJson && metadataJson.trim() !== "") {
    try {
      const parsed: unknown = JSON.parse(metadataJson);
      if (isRecord(parsed)) {
        base = { ...parsed };
      }
    } catch {
      base = {};
    }
  }

  const currentSecurity = parseSecurityObject(base[ORGANIZATION_SECURITY_METADATA_KEY]);
  const nextSecurity = applySecurityUpdate(currentSecurity, securityUpdate);

  if (nextSecurity === undefined) {
    delete base[ORGANIZATION_SECURITY_METADATA_KEY];
  } else {
    base[ORGANIZATION_SECURITY_METADATA_KEY] = nextSecurity;
  }

  if (Object.keys(base).length === 0) {
    return undefined;
  }
  return JSON.stringify(base);
}
