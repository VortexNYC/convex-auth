import { v } from "convex/values";
import { getPage } from "convex-helpers/server/pagination";
import { getOneFrom } from "convex-helpers/server/relationships";

import { bytesToBase64url } from "../convex-runtime/native/password.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { mutation, query } from "./_generated/server.js";
import schema from "./schema.js";

const MAX_SCOPES = 64;
const MAX_SCOPE_LENGTH = 128;
const MAX_REGISTRATION_LIFETIME_MS = 15 * 60_000;
const MAX_USER_CODE_LIFETIME_MS = 10 * 60_000;
const MIN_POLL_INTERVAL_SECONDS = 5;
const MAX_POLL_INTERVAL_SECONDS = 60;
const POLL_SLOW_DOWN_SECONDS = 5;
const MAX_FAILED_CODE_ATTEMPTS = 5;
/**
 * An identity assertion is structurally an OAuth authorization code: a short-lived
 * artifact exchanged once for a credential. Expiry only bounds the replay WINDOW --
 * single-use (below) is what prevents replay inside it.
 */
const ASSERTION_LIFETIME_MS = 5 * 60_000;
const MAX_CREDENTIAL_LIFETIME_SECONDS = 60 * 60;
const OPERATOR_PERMISSION = "agents:configure";

const registrationResultValidator = v.object({ registrationId: v.string() });
const claimCompletionResultValidator = v.union(
  v.object({ ok: v.literal(true), status: v.literal("claimed") }),
  v.object({
    ok: v.literal(false),
    reason: v.literal("invalid_claim"),
  }),
);
const claimPollResultValidator = v.union(
  v.object({
    status: v.literal("authorization_pending"),
    interval: v.number(),
  }),
  v.object({ status: v.literal("slow_down"), interval: v.number() }),
  v.object({ status: v.literal("expired_token") }),
  v.object({ status: v.literal("access_denied") }),
  v.object({
    status: v.literal("claimed"),
    assertionId: v.string(),
    registrationId: v.string(),
    resource: v.string(),
    userId: v.string(),
    organizationId: v.string(),
    scopes: v.array(v.string()),
    issuedAt: v.number(),
    expiresAt: v.number(),
  }),
);
const credentialAuthorityValidator = v.object({
  credentialId: v.string(),
  registrationId: v.string(),
  resource: v.string(),
  userId: v.string(),
  organizationId: v.string(),
  scopes: v.array(v.string()),
  issuedAt: v.number(),
  expiresAt: v.number(),
});
const credentialIntrospectionValidator = v.union(
  v.object({ active: v.literal(false) }),
  v.object({
    active: v.literal(true),
    credentialId: v.string(),
    registrationId: v.string(),
    resource: v.string(),
    userId: v.string(),
    organizationId: v.string(),
    scopes: v.array(v.string()),
    expiresAt: v.number(),
  }),
);
const okValidator = v.object({ ok: v.literal(true) });

type DbCtx = Pick<MutationCtx | QueryCtx, "db">;

export const registerServiceAuth = mutation({
  args: {
    resource: v.string(),
    loginHintHash: v.string(),
    scopes: v.array(v.string()),
    claimTokenHash: v.string(),
    claimViewTokenHash: v.string(),
    userCodeHash: v.string(),
    expiresAt: v.number(),
    userCodeExpiresAt: v.number(),
    pollIntervalSeconds: v.number(),
  },
  returns: registrationResultValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const resource = requireHttpsResource(args.resource);
    const scopes = normalizeScopes(args.scopes);
    requireHash(args.loginHintHash, "loginHintHash");
    requireHash(args.claimTokenHash, "claimTokenHash");
    requireHash(args.claimViewTokenHash, "claimViewTokenHash");
    requireHash(args.userCodeHash, "userCodeHash");
    requireRegistrationPolicy(args, now);
    await requireUnusedCeremonySecrets(ctx, {
      claimTokenHash: args.claimTokenHash,
      claimViewTokenHash: args.claimViewTokenHash,
    });
    const registrationId = await ctx.db.insert("auth_md_registrations", {
      resource,
      loginHintHash: args.loginHintHash,
      scopes,
      status: "pending",
      claimTokenHash: args.claimTokenHash,
      claimViewTokenHash: args.claimViewTokenHash,
      userCodeHash: args.userCodeHash,
      pollCount: 0,
      pollIntervalSeconds: args.pollIntervalSeconds,
      nextPollAt: now + args.pollIntervalSeconds * 1000,
      failedCodeAttempts: 0,
      expiresAt: args.expiresAt,
      userCodeExpiresAt: args.userCodeExpiresAt,
      createdAt: now,
      updatedAt: now,
    });
    await audit(ctx, {
      registrationId,
      actorType: "external",
      eventType: "auth_md.service_auth.registered",
    });
    return { registrationId };
  },
});

export const completeServiceAuthClaim = mutation({
  args: {
    claimViewTokenHash: v.string(),
    userCodeHash: v.string(),
    userId: v.id("users"),
    organizationId: v.id("organizations"),
  },
  returns: claimCompletionResultValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const registration = await getOneFrom(
      ctx.db,
      "auth_md_registrations",
      "by_claim_view_token_hash",
      requireHash(args.claimViewTokenHash, "claimViewTokenHash"),
      "claimViewTokenHash",
    );
    if (registration === null || registration.status !== "pending") {
      return invalidClaim();
    }
    if (registration.expiresAt <= now || registration.userCodeExpiresAt <= now) {
      await expireRegistration(ctx, registration, now, "ceremony_expired");
      return invalidClaim();
    }
    const user = await ctx.db.get("users", args.userId);
    if (
      user === null ||
      !user.isActive ||
      !user.emailVerified ||
      user.email === undefined ||
      (await hashLoginHint(user.email)) !== registration.loginHintHash
    ) {
      await recordFailedClaim(ctx, registration, now, "account_mismatch");
      return invalidClaim();
    }
    const authority = await inspectUserOrganizationAuthority(ctx, args.userId, args.organizationId);
    if (!authority.active) {
      await recordFailedClaim(ctx, registration, now, "authority_inactive");
      return invalidClaim();
    }
    if (requireHash(args.userCodeHash, "userCodeHash") !== registration.userCodeHash) {
      await recordFailedClaim(ctx, registration, now, "user_code_invalid");
      return invalidClaim();
    }
    await ctx.db.patch("auth_md_registrations", registration._id, {
      status: "claimed",
      claimedByUserId: args.userId,
      organizationId: args.organizationId,
      claimedAt: now,
      updatedAt: now,
    });
    await audit(ctx, {
      registrationId: registration._id,
      organizationId: args.organizationId,
      userId: args.userId,
      actorType: "user",
      actorUserId: args.userId,
      eventType: "auth_md.service_auth.claimed",
    });
    return { ok: true, status: "claimed" } as const;
  },
});

export const pollServiceAuthClaim = mutation({
  args: { claimTokenHash: v.string() },
  returns: claimPollResultValidator,
  handler: async (ctx, args) => {
    const registration = await getOneFrom(
      ctx.db,
      "auth_md_registrations",
      "by_claim_token_hash",
      requireHash(args.claimTokenHash, "claimTokenHash"),
      "claimTokenHash",
    );
    if (registration === null) return { status: "expired_token" } as const;
    const now = Date.now();
    if (
      registration.status === "expired" ||
      registration.expiresAt <= now ||
      (registration.status === "pending" && registration.userCodeExpiresAt <= now)
    ) {
      if (registration.status === "pending") {
        await expireRegistration(ctx, registration, now, "ceremony_expired");
      }
      return { status: "expired_token" } as const;
    }
    if (registration.status === "revoked") {
      return { status: "access_denied" } as const;
    }
    if (registration.assertionIssuedAt !== undefined) {
      return { status: "expired_token" } as const;
    }
    if (now < registration.nextPollAt) {
      const interval = Math.min(
        registration.pollIntervalSeconds + POLL_SLOW_DOWN_SECONDS,
        MAX_POLL_INTERVAL_SECONDS,
      );
      await ctx.db.patch("auth_md_registrations", registration._id, {
        pollCount: registration.pollCount + 1,
        pollIntervalSeconds: interval,
        nextPollAt: now + interval * 1000,
        updatedAt: now,
      });
      return { status: "slow_down", interval } as const;
    }
    if (registration.status === "pending") {
      await advancePollWindow(ctx, registration, now);
      return {
        status: "authorization_pending",
        interval: registration.pollIntervalSeconds,
      } as const;
    }
    const authority = await inspectRegistrationAuthority(ctx, registration);
    if (!authority.active) {
      await revokeRegistrationAsSystem(ctx, registration, now, "authority_inactive");
      return { status: "access_denied" } as const;
    }
    const expiresAt = now + ASSERTION_LIFETIME_MS;
    const assertionId = await ctx.db.insert("auth_md_assertions", {
      registrationId: registration._id,
      resource: registration.resource,
      userId: authority.userId,
      organizationId: authority.organizationId,
      scopes: registration.scopes,
      status: "active",
      expiresAt,
      createdAt: now,
    });
    await ctx.db.patch("auth_md_registrations", registration._id, {
      assertionIssuedAt: now,
      pollCount: registration.pollCount + 1,
      updatedAt: now,
    });
    await audit(ctx, {
      registrationId: registration._id,
      assertionId,
      organizationId: authority.organizationId,
      userId: authority.userId,
      actorType: "external",
      eventType: "auth_md.service_auth.assertion_authorized",
    });
    return {
      status: "claimed",
      assertionId,
      registrationId: registration._id,
      resource: registration.resource,
      userId: authority.userId,
      organizationId: authority.organizationId,
      scopes: registration.scopes,
      issuedAt: now,
      expiresAt,
    } as const;
  },
});

/**
 * Consumes the assertion BEFORE minting the credential. A leaked assertion
 * must be able to mint at most one credential — deleting this step turned any
 * captured assertion into a credential factory for its whole lifetime, which
 * expiry alone does not bound. If retry tolerance is ever needed, make this
 * IDEMPOTENT (return the credential already minted for this assertion), never
 * REUSABLE (mint a fresh one each time).
 */
export const consumeServiceAuthAssertion = mutation({
  args: {
    assertionId: v.id("auth_md_assertions"),
    credentialExpiresInSeconds: v.number(),
  },
  returns: credentialAuthorityValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    requireBoundedPositiveInteger(
      args.credentialExpiresInSeconds,
      "credentialExpiresInSeconds",
      MAX_CREDENTIAL_LIFETIME_SECONDS,
    );
    const assertion = await ctx.db.get("auth_md_assertions", args.assertionId);
    if (assertion === null || assertion.status !== "active" || assertion.expiresAt <= now) {
      throw new Error("auth.md service assertion is invalid or consumed");
    }
    const registration = await ctx.db.get("auth_md_registrations", assertion.registrationId);
    if (registration === null || registration.status !== "claimed") {
      throw new Error("auth.md service registration is not active");
    }
    const authority = await inspectRegistrationAuthority(ctx, registration);
    if (
      !authority.active ||
      authority.userId !== assertion.userId ||
      authority.organizationId !== assertion.organizationId
    ) {
      throw new Error("auth.md service authority is no longer active");
    }
    await ctx.db.patch("auth_md_assertions", assertion._id, {
      status: "consumed",
      consumedAt: now,
    });
    const expiresAt = now + args.credentialExpiresInSeconds * 1000;
    const credentialId = await ctx.db.insert("auth_md_credentials", {
      registrationId: registration._id,
      assertionId: assertion._id,
      resource: registration.resource,
      userId: authority.userId,
      organizationId: authority.organizationId,
      scopes: assertion.scopes,
      status: "active",
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
    await audit(ctx, {
      registrationId: registration._id,
      assertionId: assertion._id,
      credentialId,
      organizationId: authority.organizationId,
      userId: authority.userId,
      actorType: "external",
      eventType: "auth_md.service_auth.assertion_consumed",
    });
    return {
      credentialId,
      registrationId: registration._id,
      resource: registration.resource,
      userId: authority.userId,
      organizationId: authority.organizationId,
      scopes: assertion.scopes,
      issuedAt: now,
      expiresAt,
    };
  },
});

export const introspectServiceAuthCredential = query({
  args: { credentialId: v.id("auth_md_credentials") },
  returns: credentialIntrospectionValidator,
  handler: async (ctx, args) => {
    const credential = await ctx.db.get("auth_md_credentials", args.credentialId);
    if (
      credential === null ||
      credential.status !== "active" ||
      credential.expiresAt <= Date.now()
    ) {
      return { active: false } as const;
    }
    const registration = await ctx.db.get("auth_md_registrations", credential.registrationId);
    if (registration === null || registration.status !== "claimed") {
      return { active: false } as const;
    }
    const authority = await inspectRegistrationAuthority(ctx, registration);
    if (
      !authority.active ||
      authority.userId !== credential.userId ||
      authority.organizationId !== credential.organizationId
    ) {
      return { active: false } as const;
    }
    return {
      active: true,
      credentialId: credential._id,
      registrationId: credential.registrationId,
      resource: credential.resource,
      userId: credential.userId,
      organizationId: credential.organizationId,
      scopes: credential.scopes,
      expiresAt: credential.expiresAt,
    } as const;
  },
});

/**
 * Rotates a live credential for a fresh one.
 *
 * This exists because the assertion must NOT be the refresh mechanism. Re-exchanging an
 * identity assertion to obtain a new credential is replaying an authorization code, and
 * it makes any captured assertion a credential factory. Refresh belongs on the
 * credential, which is the thing that already proves a completed ceremony -- the same
 * split OAuth makes between an authorization code and a refresh token.
 *
 * The old credential is revoked in the same mutation (rotation), so exactly one
 * credential is live per chain and a stolen older one cannot be used alongside it.
 *
 * The delegating authority is re-checked on every refresh — a credential must
 * not outlive the human authority behind it just because it keeps rotating.
 */
export const refreshServiceAuthCredential = mutation({
  args: {
    credentialId: v.id("auth_md_credentials"),
    credentialExpiresInSeconds: v.number(),
  },
  returns: credentialAuthorityValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    requireBoundedPositiveInteger(
      args.credentialExpiresInSeconds,
      "credentialExpiresInSeconds",
      MAX_CREDENTIAL_LIFETIME_SECONDS,
    );
    const credential = await ctx.db.get("auth_md_credentials", args.credentialId);
    if (credential === null || credential.status !== "active" || credential.expiresAt <= now) {
      throw new Error("auth.md credential is invalid or expired");
    }
    const registration = await ctx.db.get("auth_md_registrations", credential.registrationId);
    if (registration === null || registration.status !== "claimed") {
      throw new Error("auth.md service registration is not active");
    }
    const authority = await inspectRegistrationAuthority(ctx, registration);
    if (
      !authority.active ||
      authority.userId !== credential.userId ||
      authority.organizationId !== credential.organizationId
    ) {
      throw new Error("auth.md service authority is no longer active");
    }

    const expiresAt = now + args.credentialExpiresInSeconds * 1000;
    const credentialId = await ctx.db.insert("auth_md_credentials", {
      registrationId: credential.registrationId,
      assertionId: credential.assertionId,
      resource: credential.resource,
      userId: credential.userId,
      organizationId: credential.organizationId,
      scopes: credential.scopes,
      status: "active",
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch("auth_md_credentials", credential._id, {
      status: "revoked",
      revokedAt: now,
      updatedAt: now,
    });
    await audit(ctx, {
      registrationId: credential.registrationId,
      assertionId: credential.assertionId,
      credentialId,
      organizationId: credential.organizationId,
      userId: credential.userId,
      actorType: "credential",
      eventType: "auth_md.service_auth.credential_refreshed",
    });
    return {
      credentialId,
      registrationId: credential.registrationId,
      resource: credential.resource,
      userId: credential.userId,
      organizationId: credential.organizationId,
      scopes: credential.scopes,
      issuedAt: now,
      expiresAt,
    };
  },
});

export const revokeServiceAuthCredentialAsHolder = mutation({
  args: { credentialId: v.id("auth_md_credentials") },
  returns: okValidator,
  handler: async (ctx, args) => {
    const credential = await ctx.db.get("auth_md_credentials", args.credentialId);
    if (credential === null || credential.status === "revoked") {
      return { ok: true } as const;
    }
    const now = Date.now();
    await ctx.db.patch("auth_md_credentials", credential._id, {
      status: "revoked",
      revokedAt: now,
      updatedAt: now,
    });
    await audit(ctx, {
      registrationId: credential.registrationId,
      assertionId: credential.assertionId,
      credentialId: credential._id,
      organizationId: credential.organizationId,
      userId: credential.userId,
      actorType: "credential",
      eventType: "auth_md.service_auth.credential_revoked",
    });
    return { ok: true } as const;
  },
});

export const revokeServiceAuthRegistration = mutation({
  args: {
    registrationId: v.id("auth_md_registrations"),
    actorUserId: v.id("users"),
  },
  returns: okValidator,
  handler: async (ctx, args) => {
    const registration = await ctx.db.get("auth_md_registrations", args.registrationId);
    if (registration === null || registration.status === "revoked") {
      return { ok: true } as const;
    }
    if (registration.claimedByUserId === undefined || registration.organizationId === undefined) {
      throw new Error("Pending auth.md registrations cannot be user-revoked");
    }
    if (args.actorUserId !== registration.claimedByUserId) {
      const authority = await inspectUserOrganizationAuthority(
        ctx,
        args.actorUserId,
        registration.organizationId,
      );
      if (!authority.active || !authority.permissions.includes(OPERATOR_PERMISSION)) {
        throw new Error("User cannot revoke this auth.md registration");
      }
    }
    const now = Date.now();
    await ctx.db.patch("auth_md_registrations", registration._id, {
      status: "revoked",
      revokedBy: args.actorUserId,
      revokedAt: now,
      updatedAt: now,
    });
    await audit(ctx, {
      registrationId: registration._id,
      organizationId: registration.organizationId,
      userId: registration.claimedByUserId,
      actorType: "user",
      actorUserId: args.actorUserId,
      eventType: "auth_md.service_auth.registration_revoked",
    });
    return { ok: true } as const;
  },
});

async function inspectRegistrationAuthority(
  ctx: DbCtx,
  registration: Doc<"auth_md_registrations">,
): Promise<
  | {
      active: true;
      userId: Id<"users">;
      organizationId: Id<"organizations">;
    }
  | { active: false }
> {
  if (
    registration.status !== "claimed" ||
    registration.claimedByUserId === undefined ||
    registration.organizationId === undefined
  ) {
    return { active: false };
  }
  const authority = await inspectUserOrganizationAuthority(
    ctx,
    registration.claimedByUserId,
    registration.organizationId,
  );
  if (!authority.active) return { active: false };
  return {
    active: true,
    userId: registration.claimedByUserId,
    organizationId: registration.organizationId,
  };
}

async function inspectUserOrganizationAuthority(
  ctx: DbCtx,
  userId: Id<"users">,
  organizationId: Id<"organizations">,
): Promise<{ active: true; permissions: string[] } | { active: false; permissions: [] }> {
  const [user, organization] = await Promise.all([
    ctx.db.get("users", userId),
    ctx.db.get("organizations", organizationId),
  ]);
  if (
    user === null ||
    !user.isActive ||
    organization === null ||
    organization.status !== "active"
  ) {
    return { active: false, permissions: [] };
  }
  const { page } = await getPage(ctx, {
    table: "organization_members",
    index: "by_user_organization",
    startIndexKey: [userId, organizationId],
    endIndexKey: [userId, organizationId],
    absoluteMaxRows: 1,
    schema,
  });
  const membership = page[0] ?? null;
  if (membership === null || membership.status !== "active") {
    return { active: false, permissions: [] };
  }
  const role = await ctx.db.get("organization_roles", membership.roleId);
  if (role === null || role.organizationId !== organizationId) {
    return { active: false, permissions: [] };
  }
  return { active: true, permissions: role.permissions };
}

async function recordFailedClaim(
  ctx: MutationCtx,
  registration: Doc<"auth_md_registrations">,
  now: number,
  reasonCode: string,
): Promise<void> {
  const failedCodeAttempts = registration.failedCodeAttempts + 1;
  const exhausted = failedCodeAttempts >= MAX_FAILED_CODE_ATTEMPTS;
  await ctx.db.patch("auth_md_registrations", registration._id, {
    failedCodeAttempts,
    ...(exhausted ? { status: "expired" as const } : {}),
    updatedAt: now,
  });
  await audit(ctx, {
    registrationId: registration._id,
    actorType: "user",
    eventType: exhausted
      ? "auth_md.service_auth.claim_attempts_exhausted"
      : "auth_md.service_auth.claim_failed",
    reasonCode,
  });
}

async function expireRegistration(
  ctx: MutationCtx,
  registration: Doc<"auth_md_registrations">,
  now: number,
  reasonCode: string,
): Promise<void> {
  await ctx.db.patch("auth_md_registrations", registration._id, {
    status: "expired",
    updatedAt: now,
  });
  await audit(ctx, {
    registrationId: registration._id,
    actorType: "system",
    eventType: "auth_md.service_auth.expired",
    reasonCode,
  });
}

async function revokeRegistrationAsSystem(
  ctx: MutationCtx,
  registration: Doc<"auth_md_registrations">,
  now: number,
  reasonCode: string,
): Promise<void> {
  await ctx.db.patch("auth_md_registrations", registration._id, {
    status: "revoked",
    revokedAt: now,
    updatedAt: now,
  });
  await audit(ctx, {
    registrationId: registration._id,
    organizationId: registration.organizationId,
    userId: registration.claimedByUserId,
    actorType: "system",
    eventType: "auth_md.service_auth.registration_revoked",
    reasonCode,
  });
}

async function advancePollWindow(
  ctx: MutationCtx,
  registration: Doc<"auth_md_registrations">,
  now: number,
): Promise<void> {
  await ctx.db.patch("auth_md_registrations", registration._id, {
    pollCount: registration.pollCount + 1,
    nextPollAt: now + registration.pollIntervalSeconds * 1000,
    updatedAt: now,
  });
}

async function requireUnusedCeremonySecrets(
  ctx: DbCtx,
  input: { claimTokenHash: string; claimViewTokenHash: string },
): Promise<void> {
  const [claimToken, claimViewToken] = await Promise.all([
    getOneFrom(
      ctx.db,
      "auth_md_registrations",
      "by_claim_token_hash",
      input.claimTokenHash,
      "claimTokenHash",
    ),
    getOneFrom(
      ctx.db,
      "auth_md_registrations",
      "by_claim_view_token_hash",
      input.claimViewTokenHash,
      "claimViewTokenHash",
    ),
  ]);
  if (claimToken !== null || claimViewToken !== null) {
    throw new Error("auth.md ceremony secret is already registered");
  }
}

function requireRegistrationPolicy(
  args: {
    expiresAt: number;
    userCodeExpiresAt: number;
    pollIntervalSeconds: number;
  },
  now: number,
): void {
  if (
    !Number.isSafeInteger(args.expiresAt) ||
    args.expiresAt <= now ||
    args.expiresAt > now + MAX_REGISTRATION_LIFETIME_MS
  ) {
    throw new Error("auth.md registration lifetime is invalid");
  }
  if (
    !Number.isSafeInteger(args.userCodeExpiresAt) ||
    args.userCodeExpiresAt <= now ||
    args.userCodeExpiresAt > now + MAX_USER_CODE_LIFETIME_MS ||
    args.userCodeExpiresAt > args.expiresAt
  ) {
    throw new Error("auth.md user_code lifetime is invalid");
  }
  requireBoundedPositiveInteger(
    args.pollIntervalSeconds,
    "pollIntervalSeconds",
    MAX_POLL_INTERVAL_SECONDS,
    MIN_POLL_INTERVAL_SECONDS,
  );
}

function normalizeScopes(values: string[]): string[] {
  if (values.length < 1 || values.length > MAX_SCOPES) {
    throw new TypeError(`auth.md scopes must contain between 1 and ${MAX_SCOPES} values`);
  }
  const scopes = values.map((value) => {
    const scope = value.trim();
    if (scope.length < 1 || scope.length > MAX_SCOPE_LENGTH || !isOAuthScopeToken(scope)) {
      throw new TypeError("auth.md scope is invalid");
    }
    return scope;
  });
  if (new Set(scopes).size !== scopes.length) {
    throw new TypeError("auth.md scopes must not contain duplicates");
  }
  return scopes.toSorted();
}

function requireHttpsResource(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("auth.md resource must be an absolute URL");
  }
  if (
    url.protocol !== "https:" ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new TypeError("auth.md resource must be a clean HTTPS URL");
  }
  return url.toString();
}

function requireHash(value: string, field: string): string {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(value)) {
    throw new TypeError(`${field} must be a SHA-256 base64url digest`);
  }
  return value;
}

async function hashLoginHint(value: string): Promise<string> {
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) {
    throw new TypeError("Convex user email is invalid");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return bytesToBase64Url(new Uint8Array(digest));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64url(bytes);
}

function isOAuthScopeToken(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code === undefined || code < 0x21 || code > 0x7e || code === 0x22 || code === 0x5c) {
      return false;
    }
  }
  return true;
}

function requireBoundedPositiveInteger(
  value: number,
  name: string,
  maximum: number,
  minimum = 1,
): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
}

function invalidClaim() {
  return { ok: false, reason: "invalid_claim" } as const;
}

async function audit(
  ctx: MutationCtx,
  input: {
    registrationId: Id<"auth_md_registrations">;
    assertionId?: Id<"auth_md_assertions">;
    credentialId?: Id<"auth_md_credentials">;
    organizationId?: Id<"organizations">;
    userId?: Id<"users">;
    actorType: "external" | "user" | "credential" | "system";
    actorUserId?: Id<"users">;
    eventType: string;
    reasonCode?: string;
  },
): Promise<void> {
  await ctx.db.insert("auth_md_audit_events", {
    ...input,
    createdAt: Date.now(),
  });
}
