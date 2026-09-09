/**
 * Suite tenant brand identity (VOR-182).
 *
 * Stored on the convex-auth organization as `metadataJson.brand` so every
 * consumer reads/writes the same shape. Product chrome (e.g. a consumer's
 * `hideBranding`, custom signing footer) stays in the consumer.
 */

export type ConvexOrganizationBrand = {
  /** Primary brand color (CSS color string, e.g. `#0F172A`). */
  primaryColor?: string;
  /** Accent / secondary color. */
  accentColor?: string;
  /** Public company / workspace website URL. */
  website?: string;
  /** Display name for outbound email From. */
  emailFromName?: string;
  /** Reply-To address for outbound email. */
  emailReplyTo?: string;
};

/** Key under organization `metadataJson` for suite brand fields. */
export const ORGANIZATION_BRAND_METADATA_KEY = "brand" as const;

type MetadataRecord = Record<string, unknown>;

function isRecord(value: unknown): value is MetadataRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseBrandObject(value: unknown): ConvexOrganizationBrand | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const brand: ConvexOrganizationBrand = {
    ...(optionalString(value.primaryColor)
      ? { primaryColor: optionalString(value.primaryColor) }
      : {}),
    ...(optionalString(value.accentColor)
      ? { accentColor: optionalString(value.accentColor) }
      : {}),
    ...(optionalString(value.website) ? { website: optionalString(value.website) } : {}),
    ...(optionalString(value.emailFromName)
      ? { emailFromName: optionalString(value.emailFromName) }
      : {}),
    ...(optionalString(value.emailReplyTo)
      ? { emailReplyTo: optionalString(value.emailReplyTo) }
      : {}),
  };
  return Object.keys(brand).length > 0 ? brand : undefined;
}

/**
 * Read suite brand fields from organization `metadataJson`.
 */
export function parseOrganizationBrandFromMetadataJson(
  metadataJson: string | null | undefined,
): ConvexOrganizationBrand | undefined {
  if (!metadataJson || metadataJson.trim() === "") {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(metadataJson);
    if (!isRecord(parsed)) {
      return undefined;
    }
    return parseBrandObject(parsed[ORGANIZATION_BRAND_METADATA_KEY]);
  } catch {
    return undefined;
  }
}

export type ConvexOrganizationBrandUpdate = {
  [K in keyof ConvexOrganizationBrand]?: string | null;
};

function applyBrandUpdate(
  current: ConvexOrganizationBrand | undefined,
  update: ConvexOrganizationBrandUpdate,
): ConvexOrganizationBrand | undefined {
  const next: ConvexOrganizationBrand = { ...current };
  const keys = ["primaryColor", "accentColor", "website", "emailFromName", "emailReplyTo"] as const;

  for (const key of keys) {
    if (!(key in update)) {
      continue;
    }
    const value = update[key];
    if (value === null || value === undefined || value.trim() === "") {
      delete next[key];
    } else {
      next[key] = value.trim();
    }
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Merge a brand patch into existing organization `metadataJson`.
 * Pass `null` field values to clear. Returns `undefined` when the result
 * would be empty metadata (caller should clear the column).
 */
export function mergeOrganizationBrandIntoMetadataJson(
  metadataJson: string | null | undefined,
  brandUpdate: ConvexOrganizationBrandUpdate,
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

  const currentBrand = parseBrandObject(base[ORGANIZATION_BRAND_METADATA_KEY]);
  const nextBrand = applyBrandUpdate(currentBrand, brandUpdate);

  if (nextBrand === undefined) {
    delete base[ORGANIZATION_BRAND_METADATA_KEY];
  } else {
    base[ORGANIZATION_BRAND_METADATA_KEY] = nextBrand;
  }

  if (Object.keys(base).length === 0) {
    return undefined;
  }
  return JSON.stringify(base);
}
