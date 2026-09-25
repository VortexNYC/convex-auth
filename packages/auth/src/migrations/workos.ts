import { isBcryptHash } from "../convex-runtime/native/password.js";
import {
  emptyExport,
  type NormalizedExport,
  type NormalizedMembership,
  type NormalizedOrganization,
  type NormalizedUser,
} from "./types.js";

/**
 * WorkOS `GET /users` shape. `password_hash`/`password_hash_type` are NOT
 * returned by the API — they only appear on a support-provided export, so
 * they stay optional and are honored when present.
 */
export type WorkosUser = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  email_verified?: boolean;
  profile_picture_url?: string | null;
  external_id?: string | null;
  password_hash?: string;
  password_hash_type?: string;
  last_sign_in_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type WorkosOrganization = {
  id: string;
  name: string;
  domains?: Array<{ domain: string }>;
  created_at?: string;
  updated_at?: string;
};

export type WorkosMembership = {
  id: string;
  user_id: string;
  organization_id: string;
  /** Older payloads carry a bare slug; newer ones nest `{ slug }`. */
  role?: string | { slug: string } | null;
  status?: string;
  created_at?: string;
  updated_at?: string;
};

export type WorkosExportInput = {
  users: WorkosUser[];
  organizations?: WorkosOrganization[];
  memberships?: WorkosMembership[];
};

function isoToMs(value: string | undefined | null): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function workosDisplayName(user: WorkosUser): string {
  return [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
}

function slugify(name: string, fallbackId: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `org-${fallbackId.toLowerCase()}`;
}

function normalizeWorkosUser(user: WorkosUser, out: NormalizedExport): NormalizedUser | null {
  const email = user.email?.toLowerCase().trim();
  if (!email) {
    out.skipped.push({ kind: "user", externalId: user.id, reason: "no email on record" });
    return null;
  }
  const normalized: NormalizedUser = {
    externalId: user.id,
    name: workosDisplayName(user),
    email,
    emailVerified: user.email_verified ?? false,
    image: user.profile_picture_url ?? undefined,
    createdAt: isoToMs(user.created_at),
    updatedAt: isoToMs(user.updated_at),
  };
  out.users.push(normalized);
  return normalized;
}

/**
 * Password credentials only exist on a WorkOS support-provided export.
 * bcrypt digests and `$argon2id$` PHC strings verify natively; every other
 * hasher (scrypt variants, ssha*, pbkdf2 non-native formats) is skipped so
 * the user lands on the reset path instead of holding an unusable hash.
 */
function normalizeWorkosCredential(user: WorkosUser, email: string, out: NormalizedExport): void {
  if (!user.password_hash) return;
  const hash = user.password_hash;
  const type = (user.password_hash_type ?? "").toLowerCase();
  const carries =
    (type === "bcrypt" && isBcryptHash(hash)) ||
    (type === "argon2" && hash.startsWith("$argon2id$"));
  if (!carries) {
    out.skipped.push({
      kind: "credential",
      externalId: user.id,
      reason: `password_hash_type '${user.password_hash_type ?? "unknown"}' is not natively verifiable — user must reset`,
    });
    return;
  }
  out.accounts.push({
    userExternalId: user.id,
    userEmail: email,
    provider: "password",
    issuer: "native",
    subject: user.id,
    passwordHash: hash,
    createdAt: isoToMs(user.created_at),
    updatedAt: isoToMs(user.updated_at),
  });
}

function normalizeWorkosMembership(
  member: WorkosMembership,
  orgById: ReadonlyMap<string, NormalizedOrganization>,
  userById: ReadonlyMap<string, NormalizedUser>,
  out: NormalizedExport,
): void {
  const org = orgById.get(member.organization_id);
  const user = userById.get(member.user_id);
  if (!org || !user) {
    out.skipped.push({
      kind: "membership",
      externalId: member.id,
      reason: `${!org ? `organization ${member.organization_id}` : `user ${member.user_id}`} not in export`,
    });
    return;
  }
  /* WorkOS membership states: "active" seats import as active, "pending" seats
   * stay invited — anything else (inactive/removed) is dropped. */
  const status = (member.status ?? "active").toLowerCase();
  if (status !== "active" && status !== "pending" && status !== "invited") {
    out.skipped.push({
      kind: "membership",
      externalId: member.id,
      reason: `membership status '${member.status}' is not importable`,
    });
    return;
  }
  const roleSlug = typeof member.role === "string" ? member.role : (member.role?.slug ?? "member");
  const normalized: NormalizedMembership = {
    organizationExternalId: org.externalId,
    organizationSlug: org.slug,
    userExternalId: user.externalId,
    userEmail: user.email,
    roleKey: roleSlug,
    status: status === "active" ? "active" : "invited",
    createdAt: isoToMs(member.created_at),
    updatedAt: isoToMs(member.updated_at),
  };
  out.memberships.push(normalized);
}

/**
 * Normalize a WorkOS export — `GET /users`, `/organizations`, and
 * `/organization_memberships` payloads. WorkOS organizations have no slug;
 * one is derived from the name and duplicate slugs are reported as skipped
 * rather than silently colliding.
 */
export function normalizeWorkosExport(input: WorkosExportInput): NormalizedExport {
  const out = emptyExport();

  for (const user of input.users) {
    const normalized = normalizeWorkosUser(user, out);
    if (!normalized) continue;
    normalizeWorkosCredential(user, normalized.email, out);
  }

  const seenSlugs = new Map<string, string>();
  for (const org of input.organizations ?? []) {
    const slug = slugify(org.name, org.id);
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
    out.organizations.push({
      externalId: org.id,
      name: org.name,
      slug,
      createdAt: isoToMs(org.created_at),
      updatedAt: isoToMs(org.updated_at),
    });
  }

  const orgById = new Map(out.organizations.map((o) => [o.externalId, o]));
  const userById = new Map(out.users.map((u) => [u.externalId, u]));
  for (const member of input.memberships ?? []) {
    normalizeWorkosMembership(member, orgById, userById, out);
  }

  return out;
}
