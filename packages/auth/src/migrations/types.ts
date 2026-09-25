/**
 * Vendor-neutral shapes produced by the export normalizers (Clerk, WorkOS)
 * and consumed by the migrate CLI, which maps them onto the component's
 * internal `migrate:*` writer mutations. `externalId` fields are the
 * source system's ids — they only exist to join users, credentials, orgs,
 * and memberships during the import; they are not persisted beyond
 * `organizations.metadataJson.migration.externalId`.
 */
export type NormalizedUser = {
  externalId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string;
  phoneNumber?: string;
  createdAt: number;
  updatedAt: number;
};

export type NormalizedAccount = {
  /** Source-system user id — resolved to a Convex `users` id at write time. */
  userExternalId: string;
  /** Join key when userExternalId resolution fails — matches NormalizedUser.email. */
  userEmail: string;
  /** "password" or an OAuth provider id ("google", "github", ...). */
  provider: string;
  /** OIDC issuer for OAuth accounts; "native" for password credentials. */
  issuer: string;
  /** Provider `sub` for OAuth; the user id for password accounts. */
  subject: string;
  /**
   * Carried credential — only formats the runtime can verify are present
   * (bcrypt imports, `$argon2id$` PHC). Absent means the user must reset.
   */
  passwordHash?: string;
  createdAt: number;
  updatedAt: number;
};

export type NormalizedOrganization = {
  externalId: string;
  name: string;
  slug: string;
  imageUrl?: string;
  createdAt: number;
  updatedAt: number;
};

export type NormalizedMembership = {
  organizationExternalId: string;
  organizationSlug: string;
  userExternalId: string;
  userEmail: string;
  /** Role key in the destination org ("admin", "member", custom keys). */
  roleKey: string;
  roleName?: string;
  /** "invited" stays invited even when the user exists in the export
   * (source membership was pending/unaccepted). Defaults to "active". */
  status?: "active" | "invited";
  createdAt: number;
  updatedAt: number;
};

export type SkippedRecord = {
  kind: "user" | "credential" | "account" | "organization" | "membership" | "session";
  externalId: string;
  reason: string;
};

export type NormalizedExport = {
  users: NormalizedUser[];
  accounts: NormalizedAccount[];
  organizations: NormalizedOrganization[];
  memberships: NormalizedMembership[];
  skipped: SkippedRecord[];
};

export function emptyExport(): NormalizedExport {
  return { users: [], accounts: [], organizations: [], memberships: [], skipped: [] };
}
