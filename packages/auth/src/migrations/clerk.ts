import { isBcryptHash } from "../convex-runtime/native/password.js";
import {
  emptyExport,
  type NormalizedAccount,
  type NormalizedExport,
  type NormalizedMembership,
  type NormalizedOrganization,
  type NormalizedUser,
} from "./types.js";

/**
 * Clerk Backend API `GET /v1/users` shape — fields we consume are typed;
 * anything else in the payload is ignored.
 */
export type ClerkApiUser = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  image_url?: string | null;
  has_image?: boolean;
  primary_email_address_id?: string | null;
  primary_phone_number_id?: string | null;
  password_enabled?: boolean;
  two_factor_enabled?: boolean;
  totp_enabled?: boolean;
  banned?: boolean;
  locked?: boolean;
  email_addresses?: Array<{
    id: string;
    email_address: string;
    verification?: { status?: string } | null;
  }>;
  phone_numbers?: Array<{
    id: string;
    phone_number: string;
    verification?: { status?: string } | null;
  }>;
  external_accounts?: Array<{
    id?: string;
    provider: string;
    provider_user_id?: string | null;
    email_address?: string | null;
    verification?: { status?: string } | null;
  }>;
  created_at?: number;
  updated_at?: number;
};

/**
 * Clerk dashboard "Export all users" CSV row (the only export surface that
 * includes password digests). Parsed into objects before normalization.
 */
export type ClerkCsvRow = {
  id: string;
  primary_email_address?: string;
  password_digest?: string;
  password_hasher?: string;
};

export type ClerkOrganization = {
  id: string;
  name: string;
  slug: string;
  image_url?: string | null;
  created_at?: number;
  updated_at?: number;
};

/** `GET /v1/organizations/{id}/memberships` member object. */
export type ClerkMembership = {
  id: string;
  role: string;
  organization?: { id: string; slug?: string } | null;
  organization_id?: string;
  public_user_data?: {
    user_id?: string;
    identifier?: string;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
  created_at?: number;
  updated_at?: number;
};

export type ClerkExportInput = {
  users: ClerkApiUser[];
  /** Dashboard CSV rows — required to carry password credentials. */
  csvRows?: ClerkCsvRow[];
  organizations?: ClerkOrganization[];
  memberships?: ClerkMembership[];
};

/** Well-known OIDC issuers for Clerk's `oauth_*` provider ids. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

const OAUTH_ISSUERS: Record<string, string> = {
  google: "https://accounts.google.com",
  github: "https://github.com/login/oauth",
  discord: "https://discord.com",
  microsoft: "https://login.microsoftonline.com",
  apple: "https://appleid.apple.com",
  facebook: "https://www.facebook.com",
  twitter: "https://twitter.com",
  linkedin: "https://www.linkedin.com",
};

function clerkTimestamp(ms: number | undefined): number {
  return typeof ms === "number" && Number.isFinite(ms) ? ms : 0;
}

function clerkDisplayName(user: ClerkApiUser): string {
  const full = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return full || (user.username ?? "");
}

function primaryEmail(user: ClerkApiUser): {
  email: string;
  verified: boolean;
} | null {
  const emails = user.email_addresses ?? [];
  const primary = user.primary_email_address_id
    ? emails.find((e) => e.id === user.primary_email_address_id)
    : undefined;
  const row = primary ?? emails[0];
  if (!row?.email_address) return null;
  return {
    email: row.email_address.toLowerCase().trim(),
    verified: row.verification?.status === "verified",
  };
}

function clerkRoleKey(role: string): string {
  // Clerk ships "org:admin", "org:member", and custom "org:<key>" roles.
  return role.startsWith("org:") ? role.slice(4) : role;
}

export function normalizeClerkUser(
  user: ClerkApiUser,
  out: NormalizedExport,
): NormalizedUser | null {
  if (user.banned || user.locked) {
    out.skipped.push({
      kind: "user",
      externalId: user.id,
      reason: `Clerk account is ${user.banned ? "banned" : "locked"} — import would activate it; recreate manually if needed`,
    });
    return null;
  }
  const email = primaryEmail(user);
  if (!email) {
    out.skipped.push({
      kind: "user",
      externalId: user.id,
      reason: "no email address on record",
    });
    return null;
  }
  const normalized: NormalizedUser = {
    externalId: user.id,
    name: clerkDisplayName(user),
    email: email.email,
    emailVerified: email.verified,
    image: user.has_image === false ? undefined : (user.image_url ?? undefined),
    createdAt: clerkTimestamp(user.created_at),
    updatedAt: clerkTimestamp(user.updated_at),
  };
  const primaryPhone = user.primary_phone_number_id
    ? (user.phone_numbers ?? []).find((p) => p.id === user.primary_phone_number_id)
    : (user.phone_numbers ?? [])[0];
  if (primaryPhone) {
    normalized.phoneNumber = primaryPhone.phone_number;
  }
  out.users.push(normalized);

  if (user.two_factor_enabled || user.totp_enabled) {
    out.skipped.push({
      kind: "credential",
      externalId: user.id,
      reason: "2FA/TOTP secrets are not exported — user re-enrolls after sign-in",
    });
  }
  return normalized;
}

/**
 * Emit the native password credential for a Clerk user. Digests only exist
 * in the dashboard CSV export — a user with `password_enabled` but no CSV
 * row must reset on first sign-in.
 */
export function normalizeClerkCredential(
  user: ClerkApiUser,
  csvRow: ClerkCsvRow | undefined,
  out: NormalizedExport,
): void {
  if (user.password_enabled !== true) return;
  const email = primaryEmail(user);
  if (!email) return;

  const digest = csvRow?.password_digest;
  if (!digest) {
    out.skipped.push({
      kind: "credential",
      externalId: user.id,
      reason: "password_enabled but no CSV digest — merge the dashboard export or the user resets",
    });
    return;
  }
  if (csvRow?.password_hasher !== "bcrypt" || !isBcryptHash(digest)) {
    out.skipped.push({
      kind: "credential",
      externalId: user.id,
      reason: `unsupported password_hasher '${csvRow?.password_hasher ?? "unknown"}' — only bcrypt digests carry over; user must reset`,
    });
    return;
  }
  out.accounts.push({
    userExternalId: user.id,
    userEmail: email.email,
    provider: "password",
    issuer: "native",
    subject: user.id,
    passwordHash: digest,
    createdAt: clerkTimestamp(user.created_at),
    updatedAt: clerkTimestamp(user.updated_at),
  });
}

export function normalizeClerkExternalAccounts(user: ClerkApiUser, out: NormalizedExport): void {
  const email = primaryEmail(user);
  for (const ext of user.external_accounts ?? []) {
    const provider = ext.provider.startsWith("oauth_")
      ? ext.provider.slice("oauth_".length)
      : ext.provider;
    if (!ext.provider_user_id) {
      out.skipped.push({
        kind: "account",
        externalId: ext.id ?? `${user.id}:${ext.provider}`,
        reason: `external account has no provider_user_id (${ext.provider})`,
      });
      continue;
    }
    if (!email) continue;
    const account: NormalizedAccount = {
      userExternalId: user.id,
      userEmail: email.email,
      provider,
      issuer: OAUTH_ISSUERS[provider] ?? provider,
      subject: ext.provider_user_id,
      createdAt: clerkTimestamp(user.created_at),
      updatedAt: clerkTimestamp(user.updated_at),
    };
    out.accounts.push(account);
  }
}

export function normalizeClerkOrganization(org: ClerkOrganization, out: NormalizedExport): void {
  const normalized: NormalizedOrganization = {
    externalId: org.id,
    name: org.name,
    slug: org.slug,
    imageUrl: org.image_url ?? undefined,
    createdAt: clerkTimestamp(org.created_at),
    updatedAt: clerkTimestamp(org.updated_at),
  };
  out.organizations.push(normalized);
}

export function normalizeClerkMembership(
  member: ClerkMembership,
  orgById: ReadonlyMap<string, ClerkOrganization>,
  userById: ReadonlyMap<string, NormalizedUser>,
  skippedUserIds: ReadonlySet<string>,
  out: NormalizedExport,
): void {
  const orgId = member.organization?.id ?? member.organization_id;
  const org = orgId ? orgById.get(orgId) : undefined;
  const userId = member.public_user_data?.user_id;
  /* A user that was present but skipped (banned/locked/no email) must not emit
   * a seat — distinct from a user simply absent from the export, whose seat
   * lands as an invite. */
  if (userId && skippedUserIds.has(userId)) {
    out.skipped.push({
      kind: "membership",
      externalId: member.id,
      reason: `member user ${userId} was skipped during normalization`,
    });
    return;
  }
  const user = userId ? userById.get(userId) : undefined;
  if (!org) {
    out.skipped.push({
      kind: "membership",
      externalId: member.id,
      reason: `organization ${orgId ?? "?"} not in export`,
    });
    return;
  }
  /* The identifier fallback is a free-form Clerk field — it can be a username,
   * so it only counts when it actually looks like an email. */
  const identifier = member.public_user_data?.identifier?.toLowerCase().trim();
  const email =
    user?.email ?? (identifier && EMAIL_SHAPE.test(identifier) ? identifier : undefined);
  if (!email) {
    out.skipped.push({
      kind: "membership",
      externalId: member.id,
      reason: "member has no resolvable email",
    });
    return;
  }
  const normalized: NormalizedMembership = {
    organizationExternalId: org.id,
    organizationSlug: org.slug,
    userExternalId: userId ?? "",
    userEmail: email,
    roleKey: clerkRoleKey(member.role),
    createdAt: clerkTimestamp(member.created_at),
    updatedAt: clerkTimestamp(member.updated_at),
  };
  out.memberships.push(normalized);
}

/**
 * Normalize a Clerk export — Backend API users/organizations/memberships
 * joined with the dashboard CSV rows that carry password digests.
 */
export function normalizeClerkExport(input: ClerkExportInput): NormalizedExport {
  const out = emptyExport();
  const csvById = new Map((input.csvRows ?? []).map((row) => [row.id, row]));

  /* Memberships join on normalized users only — banned/locked/invalid users
   * were skipped above and must not emit memberships either. */
  const userById = new Map<string, NormalizedUser>();
  for (const user of input.users) {
    const normalized = normalizeClerkUser(user, out);
    if (!normalized) continue;
    userById.set(user.id, normalized);
    normalizeClerkCredential(user, csvById.get(user.id), out);
    normalizeClerkExternalAccounts(user, out);
  }

  const orgById = new Map<string, ClerkOrganization>();
  const seenSlugs = new Map<string, string>();
  for (const org of input.organizations ?? []) {
    const slug = org.slug?.trim();
    if (!slug) {
      out.skipped.push({
        kind: "organization",
        externalId: org.id,
        reason: "organization has no slug",
      });
      continue;
    }
    const takenBy = seenSlugs.get(slug);
    if (takenBy && takenBy !== org.id) {
      out.skipped.push({
        kind: "organization",
        externalId: org.id,
        reason: `slug '${slug}' collides with organization ${takenBy} — rename before import`,
      });
      continue;
    }
    seenSlugs.set(slug, org.id);
    orgById.set(org.id, org);
    normalizeClerkOrganization(org, out);
  }

  const skippedUserIds = new Set(
    out.skipped.filter((s) => s.kind === "user").map((s) => s.externalId),
  );
  for (const member of input.memberships ?? []) {
    normalizeClerkMembership(member, orgById, userById, skippedUserIds, out);
  }

  return out;
}
