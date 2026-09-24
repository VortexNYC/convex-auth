import assert from "node:assert/strict";

import { convexTest } from "convex-test";
import { describe, it } from "vitest";

import { api } from "./component/_generated/api";
import type { Id } from "./component/_generated/dataModel";
import schema from "./component/schema";

const modules = {
  "./component/_generated/api.ts": () => import("./component/_generated/api"),
  "./component/_generated/dataModel.ts": () => import("./component/_generated/dataModel"),
  "./component/_generated/server.ts": () => import("./component/_generated/server"),
  "./component/apiKeys.ts": () => import("./component/apiKeys"),
  "./component/identity.ts": () => import("./component/identity"),
  "./component/organizations.ts": () => import("./component/organizations"),
  "./component/servicePrincipals.ts": () => import("./component/servicePrincipals"),
  "./component/status.ts": () => import("./component/status"),
  "./component/webhooks.ts": () => import("./component/webhooks"),
};

function only<T>(values: readonly T[], message: string): T {
  const [value] = values;
  assert.ok(value !== undefined, message);
  return value;
}

describe("component lifecycle APIs", () => {
  it(
    "lists and updates organization roles, members, and invitations",
    testOrganizationRolesMembersAndInvitations,
  );

  it(
    "covers full org, active-org, role, member, and invitation lifecycle APIs",
    testFullOrganizationLifecycle,
  );

  it("creates, rotates, touches, and revokes API key records", testApiKeyLifecycle);

  it("manages service principals and service-owned API keys", testServicePrincipalLifecycle);

  it(
    "manages webhook endpoint CRUD, status lifecycle, secret rotation, and delivery records",
    testWebhookEndpointLifecycle,
  );

  it("seeds the default role catalog and is idempotent", testDefaultRoleCatalogSeeding);

  it(
    "refuses cross-organization api key and invitation mutations (IDOR guard)",
    testApiKeyAndInvitationIdorGuards,
  );

  it(
    "refuses cross-organization role/member/invitation/webhook/service-principal access (IDOR guard sweep)",
    testCrossOrganizationIdorGuardSweep,
  );
});

type ComponentTest = ReturnType<typeof convexTest>;
type OrganizationSeed = Awaited<ReturnType<typeof seedOrganization>>;

async function testApiKeyLifecycle() {
  const t = convexTest(schema, modules);
  const seed = await seedOrganization(t);

  const createResult = await t.mutation(api.apiKeys.upsertApiKey, {
    organizationId: seed.organizationId,
    userId: seed.ownerUserId,
    name: "CRM production",
    keyPrefix: "app_live_123",
    keyHash: "hash-1",
    requestId: "create-request",
    requestIdExpiresAt: Date.now() + 600_000,
    scopes: ["organization:read", "people:read"],
    allowedIpRanges: [" 127.0.0.1/32 ", ""],
  });
  assert.equal(createResult.created, true);

  const replayLookup = await t.query(api.apiKeys.getApiKeyByRequestId, {
    organizationId: seed.organizationId,
    requestId: "create-request",
  });
  assert.equal(replayLookup?._id, createResult.apiKeyId);
  assert.deepEqual(replayLookup?.allowedIpRanges, ["127.0.0.1/32"]);

  await t.mutation(api.apiKeys.touchApiKeyLastUsed, {
    apiKeyId: createResult.apiKeyId,
    organizationId: seed.organizationId,
    ip: "203.0.113.1",
  });
  await t.mutation(api.apiKeys.rotateApiKey, {
    apiKeyId: createResult.apiKeyId,
    organizationId: seed.organizationId,
    keyPrefix: "app_live_456",
    keyHash: "hash-2",
  });
  await t.mutation(api.apiKeys.revokeApiKey, {
    apiKeyId: createResult.apiKeyId,
    organizationId: seed.organizationId,
  });

  const revokedKeys = await t.query(api.apiKeys.listApiKeysByOrganization, {
    organizationId: seed.organizationId,
    status: "revoked",
  });
  assert.equal(revokedKeys.length, 1);
  const revokedKey = only(revokedKeys, "revoked API key is missing");
  assert.equal(revokedKey.keyPrefix, "app_live_456");
  assert.equal(revokedKey.lastUsedAt, undefined);
}

async function testServicePrincipalLifecycle() {
  const t = convexTest(schema, modules);
  const seed = await seedOrganization(t);

  const service = await createAndUpdateServicePrincipal(t, seed);
  await assertServiceOwnedApiKey(t, seed, service.servicePrincipalId);
  await assertDisabledServicePrincipalCannotIssueKeys(t, seed, service.servicePrincipalId);
}

async function createAndUpdateServicePrincipal(t: ComponentTest, seed: OrganizationSeed) {
  const service = await t.mutation(api.servicePrincipals.upsertServicePrincipal, {
    key: "crm-sync",
    name: "CRM Sync",
    organizationId: seed.organizationId,
    permissions: ["organization:read", "people:read", "people:write"],
    createdBy: seed.ownerUserId,
    metadataJson: JSON.stringify({ app: "crm" }),
  });
  assert.equal(service.created, true);

  await t.mutation(api.servicePrincipals.setServicePrincipalDetails, {
    actingOrganizationId: seed.organizationId,
    servicePrincipalId: service.servicePrincipalId,
    name: "CRM Sync Worker",
    permissions: ["organization:read", "people:read"],
  });
  const serviceByKey = await t.query(api.servicePrincipals.getServicePrincipalByKey, {
    key: " crm-sync ",
  });
  assert.equal(serviceByKey?._id, service.servicePrincipalId);
  assert.equal(serviceByKey?.name, "CRM Sync Worker");
  assert.deepEqual(serviceByKey?.permissions, ["organization:read", "people:read"]);

  return service;
}

async function assertServiceOwnedApiKey(
  t: ComponentTest,
  seed: OrganizationSeed,
  servicePrincipalId: Id<"service_principals">,
) {
  const serviceKey = await t.mutation(api.apiKeys.upsertServiceOwnedApiKey, {
    servicePrincipalId,
    name: "CRM Sync production",
    keyPrefix: "svc_crm_123",
    keyHash: "service-hash-1",
    requestId: "service-create-request",
    requestIdExpiresAt: Date.now() + 600_000,
    scopes: ["app:sync"],
    permissions: ["organization:read"],
    allowedIpRanges: [" 203.0.113.10/32 ", ""],
  });
  const storedServiceKey = await t.query(api.apiKeys.getApiKey, {
    apiKeyId: serviceKey.apiKeyId,
  });
  assert.equal(storedServiceKey?.ownerType, "service");
  assert.equal(storedServiceKey?.ownerId, servicePrincipalId);
  assert.equal(storedServiceKey?.ownerServicePrincipalId, servicePrincipalId);
  assert.equal(storedServiceKey?.organizationId, seed.organizationId);
  assert.equal(storedServiceKey?.fixedOrganizationId, seed.organizationId);
  assert.deepEqual(storedServiceKey?.permissions, ["organization:read"]);
  assert.deepEqual(storedServiceKey?.allowedIpRanges, ["203.0.113.10/32"]);

  await assert.rejects(
    t.mutation(api.apiKeys.upsertServiceOwnedApiKey, {
      servicePrincipalId,
      name: "CRM Sync overreach",
      keyPrefix: "svc_crm_456",
      keyHash: "service-hash-2",
      scopes: ["app:sync"],
      permissions: ["settings:write"],
    }),
    /API key permissions exceed service principal permissions/,
  );

  const listedServiceKeys = await t.query(api.apiKeys.listApiKeysByServicePrincipal, {
    servicePrincipalId,
    status: "active",
  });
  assert.equal(listedServiceKeys.length, 1);
  assert.equal(
    only(listedServiceKeys, "service-owned API key is missing")._id,
    serviceKey.apiKeyId,
  );
}

async function assertDisabledServicePrincipalCannotIssueKeys(
  t: ComponentTest,
  seed: OrganizationSeed,
  servicePrincipalId: Id<"service_principals">,
) {
  await t.mutation(api.servicePrincipals.setServicePrincipalStatus, {
    actingOrganizationId: seed.organizationId,
    servicePrincipalId,
    status: "disabled",
  });
  await assert.rejects(
    t.mutation(api.apiKeys.upsertServiceOwnedApiKey, {
      servicePrincipalId,
      name: "Disabled service key",
      keyPrefix: "svc_crm_disabled",
      keyHash: "service-hash-disabled",
      scopes: ["app:sync"],
    }),
    /Only active service principals can issue API keys/,
  );

  const disabledServices = await t.query(api.servicePrincipals.listServicePrincipals, {
    organizationId: seed.organizationId,
    status: "disabled",
  });
  assert.equal(disabledServices.length, 1);
  assert.equal(
    only(disabledServices, "disabled service principal is missing")._id,
    servicePrincipalId,
  );
}

async function testDefaultRoleCatalogSeeding() {
  const t = convexTest(schema, modules);
  const ownerUserId = await insertSeedOwner(t);
  const organization = await t.mutation(api.organizations.upsertOrganization, {
    name: "Seed Co",
    slug: `seed-${crypto.randomUUID()}`,
    createdBy: ownerUserId,
  });
  const catalog = defaultRoleCatalog();

  const first = await t.mutation(api.organizations.seedDefaultRoles, {
    organizationId: organization.organizationId,
    createdBy: ownerUserId,
    catalog,
  });
  assert.equal(first.seeded, 5);
  assert.equal(first.roleIds.length, 5);
  await assertSeededRoleCatalog(t, organization.organizationId);

  const second = await t.mutation(api.organizations.seedDefaultRoles, {
    organizationId: organization.organizationId,
    createdBy: ownerUserId,
    catalog,
  });
  assert.equal(second.seeded, 5);
  assert.deepEqual([...second.roleIds].toSorted(), [...first.roleIds].toSorted());
  await assertRoleCount(t, organization.organizationId, 5);
  await assertFallbackRoleCatalog(t, ownerUserId);
}

async function insertSeedOwner(t: ComponentTest) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("users", {
      email: `seed-${crypto.randomUUID()}@example.com`,
      name: "Seed Owner",
      emailVerified: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  });
}

function defaultRoleCatalog() {
  return [
    {
      key: "owner",
      name: "Owner",
      description: "Full control.",
      permissions: ["*"],
      isSystem: true,
    },
    {
      key: "admin",
      name: "Admin",
      description: "Broad management.",
      permissions: ["organization:read", "organization:members:manage"],
      isSystem: true,
    },
    {
      key: "manager",
      name: "Manager",
      description: "Operations.",
      permissions: ["organization:read", "organization:members:manage"],
      isSystem: false,
    },
    {
      key: "member",
      name: "Member",
      description: "Baseline.",
      permissions: ["organization:read"],
      isSystem: false,
    },
    {
      key: "viewer",
      name: "Viewer",
      description: "Read-only.",
      permissions: ["organization:read"],
      isSystem: false,
    },
  ];
}

async function assertSeededRoleCatalog(t: ComponentTest, organizationId: Id<"organizations">) {
  const rolesAfterFirst = await t.query(api.organizations.listRolesByOrganization, {
    organizationId,
  });
  assert.equal(rolesAfterFirst.length, 5);
  const ownerRole = rolesAfterFirst.find((role) => role.key === "owner");
  assert.deepEqual(ownerRole?.permissions, ["*"]);
  assert.equal(ownerRole?.isSystem, true);
}

async function assertRoleCount(
  t: ComponentTest,
  organizationId: Id<"organizations">,
  expectedCount: number,
) {
  const roles = await t.query(api.organizations.listRolesByOrganization, {
    organizationId,
  });
  assert.equal(roles.length, expectedCount);
}

async function assertFallbackRoleCatalog(t: ComponentTest, ownerUserId: Id<"users">) {
  const fallbackOrganization = await t.mutation(api.organizations.upsertOrganization, {
    name: "Fallback Co",
    slug: `seed-fallback-${crypto.randomUUID()}`,
    createdBy: ownerUserId,
  });
  const fallback = await t.mutation(api.organizations.seedDefaultRoles, {
    organizationId: fallbackOrganization.organizationId,
  });
  assert.equal(fallback.seeded, 2);
  const fallbackRoles = await t.query(api.organizations.listRolesByOrganization, {
    organizationId: fallbackOrganization.organizationId,
  });
  assert.deepEqual(fallbackRoles.map((role) => role.key).toSorted(), ["member", "owner"]);
}

async function testApiKeyAndInvitationIdorGuards() {
  const t = convexTest(schema, modules);
  const orgA = await seedOrganization(t);
  const orgB = await seedOrganization(t);

  await assertApiKeyIdorGuards(t, orgA, orgB);
  await assertInvitationEmailDeliveryIdorGuard(t, orgA, orgB);
}

async function assertApiKeyIdorGuards(
  t: ComponentTest,
  orgA: OrganizationSeed,
  orgB: OrganizationSeed,
) {
  const key = await t.mutation(api.apiKeys.upsertApiKey, {
    organizationId: orgA.organizationId,
    userId: orgA.ownerUserId,
    name: "Org A key",
    keyPrefix: "a_live_111",
    keyHash: "hash-a",
    scopes: ["organization:read"],
  });

  await assert.rejects(
    () =>
      t.mutation(api.apiKeys.revokeApiKey, {
        apiKeyId: key.apiKeyId,
        organizationId: orgB.organizationId,
      }),
    /API key not found/,
  );
  await assert.rejects(
    () =>
      t.mutation(api.apiKeys.rotateApiKey, {
        apiKeyId: key.apiKeyId,
        organizationId: orgB.organizationId,
        keyPrefix: "b_live_999",
        keyHash: "hash-b",
      }),
    /API key not found/,
  );
  await assert.rejects(
    () =>
      t.mutation(api.apiKeys.touchApiKeyLastUsed, {
        apiKeyId: key.apiKeyId,
        organizationId: orgB.organizationId,
        ip: "203.0.113.9",
      }),
    /API key not found/,
  );

  const stillActive = await t.query(api.apiKeys.getApiKey, {
    apiKeyId: key.apiKeyId,
  });
  assert.equal(stillActive?.status, "active");
  assert.equal(stillActive?.keyPrefix, "a_live_111");
  assert.equal(stillActive?.lastUsedAt, undefined);

  await t.mutation(api.apiKeys.revokeApiKey, {
    apiKeyId: key.apiKeyId,
    organizationId: orgA.organizationId,
  });
  const revoked = await t.query(api.apiKeys.getApiKey, {
    apiKeyId: key.apiKeyId,
  });
  assert.equal(revoked?.status, "revoked");
}

async function assertInvitationEmailDeliveryIdorGuard(
  t: ComponentTest,
  orgA: OrganizationSeed,
  orgB: OrganizationSeed,
) {
  const invitation = await t.mutation(api.organizations.upsertInvitation, {
    organizationId: orgA.organizationId,
    roleId: orgA.memberRoleId,
    email: "invitee@example.com",
    tokenHash: "token-a",
    invitedBy: orgA.ownerUserId,
    expiresAt: Date.now() + 86_400_000,
  });
  await assert.rejects(
    () =>
      t.mutation(api.organizations.recordInvitationEmailDelivery, {
        invitationId: invitation.invitationId,
        organizationId: orgB.organizationId,
        emailDeliveryStatus: "bounced",
      }),
    /Organization invitation not found/,
  );
  assert.deepEqual(
    await t.mutation(api.organizations.recordInvitationEmailDelivery, {
      invitationId: invitation.invitationId,
      organizationId: orgA.organizationId,
      emailDeliveryStatus: "sent",
      emailId: "email-a",
    }),
    { ok: true },
  );
}

async function testOrganizationRolesMembersAndInvitations() {
  const t = convexTest(schema, modules);
  const seed = await seedOrganization(t);

  await assertSuspendedOrganizationListing(t, seed);
  await assertCustomRoleUpdate(t, seed);
  await assertMemberLifecycleListing(t, seed);
  await assertInvitationEmailLifecycle(t, seed);
}

async function assertSuspendedOrganizationListing(t: ComponentTest, seed: OrganizationSeed) {
  assert.deepEqual(
    await t.mutation(api.organizations.setOrganizationStatus, {
      organizationId: seed.organizationId,
      status: "suspended",
    }),
    { ok: true },
  );

  const suspendedOrganizations = await t.query(api.organizations.listOrganizations, {
    status: "suspended",
  });
  assert.equal(suspendedOrganizations.length, 1);
  assert.equal(
    only(suspendedOrganizations, "suspended organization is missing")._id,
    seed.organizationId,
  );

  const roles = await t.query(api.organizations.listRolesByOrganization, {
    organizationId: seed.organizationId,
  });
  assert.equal(roles.length, 2);
}

async function assertCustomRoleUpdate(t: ComponentTest, seed: OrganizationSeed) {
  const customRole = await t.mutation(api.organizations.ensureRole, {
    organizationId: seed.organizationId,
    key: "operator",
    name: "Operator",
    permissions: ["organization:read"],
    createdBy: seed.ownerUserId,
  });
  await t.mutation(api.organizations.setRoleDetails, {
    roleId: customRole.roleId,
    permissions: ["organization:read", "organization:members"],
  });
  const memberRole = await t.query(api.organizations.getRole, {
    roleId: customRole.roleId,
    organizationId: seed.organizationId,
  });
  assert.deepEqual(memberRole?.permissions, ["organization:read", "organization:members"]);
}

async function assertMemberLifecycleListing(t: ComponentTest, seed: OrganizationSeed) {
  const memberResult = await t.mutation(api.organizations.upsertMember, {
    organizationId: seed.organizationId,
    userId: seed.memberUserId,
    roleId: seed.memberRoleId,
  });
  await t.mutation(api.organizations.setMemberRole, {
    organizationId: seed.organizationId,
    memberId: memberResult.memberId,
    roleId: seed.ownerRoleId,
    assignedBy: seed.ownerUserId,
  });
  await t.mutation(api.organizations.setMemberStatus, {
    memberId: memberResult.memberId,
    status: "suspended",
  });

  const suspendedMembers = await t.query(api.organizations.listMembersByOrganization, {
    organizationId: seed.organizationId,
    status: "suspended",
  });
  assert.equal(suspendedMembers.length, 1);
  assert.equal(only(suspendedMembers, "suspended member is missing").roleId, seed.ownerRoleId);

  const userMemberships = await t.query(api.organizations.listMembershipsByUser, {
    userId: seed.memberUserId,
  });
  assert.equal(userMemberships.length, 1);
  assert.equal(
    only(userMemberships, "user membership is missing").organizationId,
    seed.organizationId,
  );
  const activeUserMemberships = await t.query(api.organizations.listMembershipsByUser, {
    userId: seed.memberUserId,
    status: "active",
  });
  assert.equal(activeUserMemberships.length, 0);
}

async function assertInvitationEmailLifecycle(t: ComponentTest, seed: OrganizationSeed) {
  const invitationResult = await t.mutation(api.organizations.upsertInvitation, {
    organizationId: seed.organizationId,
    roleId: seed.memberRoleId,
    email: " Invited@Example.com ",
    tokenHash: "token-hash",
    invitedBy: seed.ownerUserId,
    expiresAt: Date.now() + 86_400_000,
  });
  await t.mutation(api.organizations.recordInvitationEmailDelivery, {
    invitationId: invitationResult.invitationId,
    organizationId: seed.organizationId,
    emailDeliveryStatus: "sent",
    emailId: "email-1",
  });

  const byEmailId = await t.query(api.organizations.getInvitationByEmailId, {
    emailId: "email-1",
  });
  assert.equal(byEmailId?._id, invitationResult.invitationId);
  const missingByEmailId = await t.query(api.organizations.getInvitationByEmailId, {
    emailId: "no-such-email",
  });
  assert.equal(missingByEmailId, null);

  await t.mutation(api.organizations.setInvitationStatus, {
    invitationId: invitationResult.invitationId,
    organizationId: seed.organizationId,
    status: "revoked",
  });

  const revokedInvitations = await t.query(api.organizations.listInvitationsByOrganization, {
    organizationId: seed.organizationId,
    status: "revoked",
  });
  assert.equal(revokedInvitations.length, 1);
  const revokedInvitation = only(revokedInvitations, "revoked invitation is missing");
  assert.equal(revokedInvitation.email, "invited@example.com");
  assert.equal(revokedInvitation.emailDeliveryStatus, "sent");
  assert.equal(typeof revokedInvitation.revokedAt, "number");
}

async function testFullOrganizationLifecycle() {
  const t = convexTest(schema, modules);
  const seed = await seedOrganization(t);
  const organizationId = await assertOrganizationDetailsLifecycle(t, seed);
  const roles = await assertRoleLifecycleProtections(t, seed, organizationId);
  const ownerMemberId = await assertActiveOrganizationLifecycle(t, seed, organizationId, roles);

  await assertRoleDeletionLifecycle(t, seed, organizationId, roles, ownerMemberId);
  await assertInvitationRedemptionLifecycle(t, seed, organizationId, roles.managerRoleId);
}

function isMetadataRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function assertOrganizationDetailsLifecycle(t: ComponentTest, seed: OrganizationSeed) {
  const slug = `lifecycle-${crypto.randomUUID()}`;
  const createdOrganization = await t.mutation(api.organizations.upsertOrganization, {
    name: "Lifecycle Co",
    slug,
    createdBy: seed.ownerUserId,
    metadataJson: JSON.stringify({ source: "test" }),
  });
  assert.equal(createdOrganization.created, true);

  await t.mutation(api.organizations.setOrganizationDetails, {
    organizationId: createdOrganization.organizationId,
    name: "Lifecycle Company",
    slug: `${slug}-updated`,
    imageUrl: "https://example.com/logo.png",
  });
  const updatedOrganization = await t.query(api.organizations.getOrganization, {
    organizationId: createdOrganization.organizationId,
  });
  assert.equal(updatedOrganization?.name, "Lifecycle Company");
  assert.equal(updatedOrganization?.slug, `${slug}-updated`);

  await t.mutation(api.organizations.setOrganizationDetails, {
    organizationId: createdOrganization.organizationId,
    brand: {
      primaryColor: "#0F172A",
      website: "https://acme.example",
      emailFromName: "Acme",
    },
  });
  const brandedOrganization = await t.query(api.organizations.getOrganization, {
    organizationId: createdOrganization.organizationId,
  });
  assert.ok(brandedOrganization?.metadataJson);
  const brandedMetadata: unknown = JSON.parse(brandedOrganization.metadataJson);
  assert.ok(isMetadataRecord(brandedMetadata));
  assert.equal(brandedMetadata.source, "test");
  assert.deepEqual(brandedMetadata.brand, {
    primaryColor: "#0F172A",
    website: "https://acme.example",
    emailFromName: "Acme",
  });

  await t.mutation(api.organizations.setOrganizationDetails, {
    organizationId: createdOrganization.organizationId,
    security: {
      requireMfa: true,
      sessionTimeoutMinutes: 120,
    },
  });
  const securedOrganization = await t.query(api.organizations.getOrganization, {
    organizationId: createdOrganization.organizationId,
  });
  assert.ok(securedOrganization?.metadataJson);
  const securedMetadata: unknown = JSON.parse(securedOrganization.metadataJson);
  assert.ok(isMetadataRecord(securedMetadata));
  assert.equal(securedMetadata.source, "test");
  assert.deepEqual(securedMetadata.brand, {
    primaryColor: "#0F172A",
    website: "https://acme.example",
    emailFromName: "Acme",
  });
  assert.deepEqual(securedMetadata.security, {
    requireMfa: true,
    sessionTimeoutMinutes: 120,
  });

  await assert.rejects(
    t.mutation(api.organizations.setOrganizationDetails, {
      organizationId: createdOrganization.organizationId,
      metadataJson: JSON.stringify({ replaced: true }),
      brand: { primaryColor: "#111111" },
    }),
    /Pass either metadataJson or brand\/security fields, not both/,
  );

  /*
   * Clear MFA requirement so later lifecycle steps can switch active org
   * without Better Auth TOTP attestation (enforcement covered below).
   */
  await t.mutation(api.organizations.setOrganizationDetails, {
    organizationId: createdOrganization.organizationId,
    security: { requireMfa: false },
  });

  return createdOrganization.organizationId;
}

async function assertRoleLifecycleProtections(
  t: ComponentTest,
  seed: OrganizationSeed,
  organizationId: Id<"organizations">,
) {
  const ownerRole = await t.mutation(api.organizations.ensureRole, {
    organizationId,
    key: "owner",
    name: "Owner",
    permissions: ["*"],
    isSystem: true,
    createdBy: seed.ownerUserId,
  });
  await assert.rejects(
    t.mutation(api.organizations.ensureRole, {
      organizationId,
      key: "owner",
      name: "Owner",
      permissions: ["*"],
      isSystem: false,
    }),
    /Organization role system flag cannot be changed/,
  );
  const managerRole = await t.mutation(api.organizations.ensureRole, {
    organizationId,
    key: "manager",
    name: "Manager",
    permissions: ["organization:read"],
    createdBy: seed.ownerUserId,
  });
  await t.mutation(api.organizations.setRoleDetails, {
    roleId: managerRole.roleId,
    name: "Operations Manager",
    permissions: ["organization:read", "organization:members:update"],
  });
  await assert.rejects(
    t.mutation(api.organizations.setRoleDetails, {
      roleId: ownerRole.roleId,
      permissions: ["organization:read"],
    }),
    /System organization roles cannot be modified/,
  );
  await assert.rejects(
    t.mutation(api.organizations.setRoleDetails, {
      roleId: managerRole.roleId,
      isSystem: true,
    }),
    /Organization role system flag cannot be changed/,
  );

  return { managerRoleId: managerRole.roleId, ownerRoleId: ownerRole.roleId };
}

async function assertActiveOrganizationLifecycle(
  t: ComponentTest,
  seed: OrganizationSeed,
  organizationId: Id<"organizations">,
  roles: {
    managerRoleId: Id<"organization_roles">;
    ownerRoleId: Id<"organization_roles">;
  },
) {
  const ownerMember = await t.mutation(api.organizations.upsertMember, {
    organizationId,
    userId: seed.ownerUserId,
    roleId: roles.managerRoleId,
    assignedBy: seed.ownerUserId,
  });

  await t.mutation(api.organizations.setOrganizationDetails, {
    organizationId,
    security: { requireMfa: true },
  });
  await assert.rejects(
    t.mutation(api.organizations.setUserActiveOrganization, {
      userId: seed.ownerUserId,
      organizationId,
      twoFactorEnabled: false,
    }),
    /requires two-factor authentication/,
  );
  await t.mutation(api.organizations.setUserActiveOrganization, {
    userId: seed.ownerUserId,
    organizationId,
    twoFactorEnabled: true,
  });
  await t.mutation(api.organizations.setOrganizationDetails, {
    organizationId,
    security: { requireMfa: false },
  });

  const activeOrganizationId = await t.run(async (ctx) => {
    const user = await ctx.db.get(seed.ownerUserId);
    return user?.activeOrganizationId;
  });
  assert.equal(activeOrganizationId, organizationId);

  return ownerMember.memberId;
}

async function assertRoleDeletionLifecycle(
  t: ComponentTest,
  seed: OrganizationSeed,
  organizationId: Id<"organizations">,
  roles: {
    managerRoleId: Id<"organization_roles">;
    ownerRoleId: Id<"organization_roles">;
  },
  ownerMemberId: Id<"organization_members">,
) {
  await assert.rejects(
    t.mutation(api.organizations.deleteRole, {
      organizationId,
      roleId: roles.ownerRoleId,
    }),
    /System organization roles cannot be deleted/,
  );
  await assert.rejects(
    t.mutation(api.organizations.deleteRole, {
      organizationId,
      roleId: roles.managerRoleId,
    }),
    /Organization role is assigned to members/,
  );
  await t.mutation(api.organizations.setMemberRole, {
    organizationId,
    memberId: ownerMemberId,
    roleId: roles.ownerRoleId,
    assignedBy: seed.ownerUserId,
  });
  const disposableRole = await t.mutation(api.organizations.ensureRole, {
    organizationId,
    key: "auditor",
    name: "Auditor",
    permissions: ["organization:read"],
    createdBy: seed.ownerUserId,
  });
  await t.mutation(api.organizations.deleteRole, {
    organizationId,
    roleId: disposableRole.roleId,
  });
}

async function assertInvitationRedemptionLifecycle(
  t: ComponentTest,
  seed: OrganizationSeed,
  organizationId: Id<"organizations">,
  managerRoleId: Id<"organization_roles">,
) {
  const redeemableInvitation = await t.mutation(api.organizations.upsertInvitation, {
    organizationId,
    roleId: managerRoleId,
    email: " Member@Example.com ",
    tokenHash: "redeemable-token",
    invitedBy: seed.ownerUserId,
    expiresAt: Date.now() + 86_400_000,
  });
  await t.mutation(api.organizations.resendInvitation, {
    invitationId: redeemableInvitation.invitationId,
    emailId: "email-redeemable",
    emailDeliveryStatus: "queued",
  });
  const redeemResult = await t.mutation(api.organizations.redeemInvitation, {
    tokenHash: "redeemable-token",
    acceptedByUserId: seed.memberUserId,
  });
  assert.equal(redeemResult.invitationId, redeemableInvitation.invitationId);
  assert.equal(redeemResult.accepted, true);

  await assertInvitationReplay(
    t,
    seed,
    organizationId,
    redeemableInvitation.invitationId,
    redeemResult.memberId,
  );
  await assertRevokedInvitationCannotRedeem(t, seed, organizationId, managerRoleId);
  await assertExpiredInvitationCannotRedeem(t, seed, organizationId, managerRoleId);
}

async function assertInvitationReplay(
  t: ComponentTest,
  seed: OrganizationSeed,
  organizationId: Id<"organizations">,
  invitationId: Id<"organization_invitations">,
  memberId: Id<"organization_members">,
) {
  const replayRedeemResult = await t.mutation(api.organizations.redeemInvitation, {
    invitationId,
    tokenHash: "redeemable-token",
    acceptedByUserId: seed.memberUserId,
  });
  assert.equal(replayRedeemResult.memberId, memberId);
  assert.equal(replayRedeemResult.accepted, false);

  const acceptedInvitation = await t.query(api.organizations.getInvitation, {
    invitationId,
    organizationId,
  });
  assert.equal(acceptedInvitation?.status, "accepted");
  assert.equal(acceptedInvitation?.emailDeliveryStatus, "queued");
}

async function assertRevokedInvitationCannotRedeem(
  t: ComponentTest,
  seed: OrganizationSeed,
  organizationId: Id<"organizations">,
  managerRoleId: Id<"organization_roles">,
) {
  const revokedInvitation = await t.mutation(api.organizations.upsertInvitation, {
    organizationId,
    roleId: managerRoleId,
    email: "revoked@example.com",
    tokenHash: "revoked-token",
    invitedBy: seed.ownerUserId,
    expiresAt: Date.now() + 86_400_000,
  });
  await t.mutation(api.organizations.revokeInvitation, {
    invitationId: revokedInvitation.invitationId,
  });
  await assert.rejects(
    t.mutation(api.organizations.redeemInvitation, {
      tokenHash: "revoked-token",
      acceptedByUserId: seed.memberUserId,
    }),
    /Organization invitation is revoked/,
  );
}

async function assertExpiredInvitationCannotRedeem(
  t: ComponentTest,
  seed: OrganizationSeed,
  organizationId: Id<"organizations">,
  managerRoleId: Id<"organization_roles">,
) {
  const expiredInvitation = await t.mutation(api.organizations.upsertInvitation, {
    organizationId,
    roleId: managerRoleId,
    email: "expired@example.com",
    tokenHash: "expired-token",
    invitedBy: seed.ownerUserId,
    expiresAt: Date.now() - 1,
  });
  await assert.rejects(
    t.mutation(api.organizations.redeemInvitation, {
      tokenHash: "expired-token",
      acceptedByUserId: seed.memberUserId,
    }),
    /Organization invitation is expired/,
  );
  const expired = await t.query(api.organizations.getInvitation, {
    invitationId: expiredInvitation.invitationId,
    organizationId,
  });
  assert.equal(expired?.status, "pending");
}

async function testWebhookEndpointLifecycle() {
  const t = convexTest(schema, modules);
  const seed = await seedOrganization(t);
  const endpointId = await assertWebhookEndpointCreateUpdateAndRotate(t, seed);

  await assertWebhookDeliveryLifecycle(t, endpointId);
  await assertWebhookArchiveAndDeleteLifecycle(t, seed, endpointId);
}

async function assertWebhookEndpointCreateUpdateAndRotate(
  t: ComponentTest,
  seed: OrganizationSeed,
) {
  const created = await t.mutation(api.webhooks.createWebhookEndpoint, {
    organizationId: seed.organizationId,
    url: " https://example.com/webhooks ",
    description: "Production hook",
    eventTypes: ["invoice.created ", "payment.received"],
    secret: "whsec_test_secret_123",
    createdBy: seed.ownerUserId,
  });
  assert.equal(created.created, true);

  const endpoint = await t.query(api.webhooks.getWebhookEndpoint, {
    endpointId: created.endpointId,
  });
  assert.equal(endpoint?.url, "https://example.com/webhooks");
  assert.equal(endpoint?.description, "Production hook");
  assert.deepEqual(endpoint?.eventTypes, ["invoice.created", "payment.received"]);
  assert.equal(endpoint?.status, "active");

  const withSecret = await t.query(api.webhooks.getWebhookEndpointWithSecret, {
    endpointId: created.endpointId,
  });
  assert.equal(withSecret?.secret, "whsec_test_secret_123");

  await assertWebhookEndpointUpdate(t, seed, created.endpointId);
  await assertWebhookSecretRotation(t, seed, created.endpointId);
  await assertWebhookStatusToggle(t, seed, created.endpointId);

  return created.endpointId;
}

async function assertWebhookEndpointUpdate(
  t: ComponentTest,
  seed: OrganizationSeed,
  endpointId: Id<"webhook_endpoints">,
) {
  await t.mutation(api.webhooks.updateWebhookEndpoint, {
    organizationId: seed.organizationId,
    endpointId,
    url: "https://new.example.com/webhooks",
    description: "Updated hook",
    eventTypes: ["invoice.created"],
  });
  const updated = await t.query(api.webhooks.getWebhookEndpoint, {
    endpointId,
  });
  assert.equal(updated?.url, "https://new.example.com/webhooks");
  assert.deepEqual(updated?.eventTypes, ["invoice.created"]);
}

async function assertWebhookSecretRotation(
  t: ComponentTest,
  seed: OrganizationSeed,
  endpointId: Id<"webhook_endpoints">,
) {
  await t.mutation(api.webhooks.rotateWebhookEndpointSecret, {
    organizationId: seed.organizationId,
    endpointId,
    secret: "whsec_rotated_secret_456",
  });
  const rotated = await t.query(api.webhooks.getWebhookEndpointWithSecret, {
    endpointId,
  });
  assert.equal(rotated?.secret, "whsec_rotated_secret_456");
}

async function assertWebhookStatusToggle(
  t: ComponentTest,
  seed: OrganizationSeed,
  endpointId: Id<"webhook_endpoints">,
) {
  await t.mutation(api.webhooks.setWebhookEndpointStatus, {
    organizationId: seed.organizationId,
    endpointId,
    status: "disabled",
  });
  const disabled = await t.query(api.webhooks.getWebhookEndpoint, {
    endpointId,
  });
  assert.equal(disabled?.status, "disabled");

  await t.mutation(api.webhooks.setWebhookEndpointStatus, {
    organizationId: seed.organizationId,
    endpointId,
    status: "active",
  });
}

async function assertWebhookDeliveryLifecycle(
  t: ComponentTest,
  endpointId: Id<"webhook_endpoints">,
) {
  const deliveryResult = await t.mutation(api.webhooks.createWebhookDelivery, {
    endpointId,
    eventId: "evt_test_1",
    eventType: "invoice.created",
    payloadJson: JSON.stringify({ id: "inv_1" }),
  });
  assert.equal(deliveryResult.created, true);

  const delivery = await t.query(api.webhooks.getWebhookDelivery, {
    deliveryId: deliveryResult.deliveryId,
  });
  assert.equal(delivery?.status, "pending");
  assert.equal(delivery?.attemptCount, 0);

  await t.mutation(api.webhooks.updateWebhookDelivery, {
    deliveryId: deliveryResult.deliveryId,
    status: "delivered",
    attemptCount: 1,
    responseStatus: 200,
    responseBody: "OK",
    deliveredAt: Date.now(),
  });
  const delivered = await t.query(api.webhooks.getWebhookDelivery, {
    deliveryId: deliveryResult.deliveryId,
  });
  assert.equal(delivered?.status, "delivered");
  assert.equal(delivered?.responseStatus, 200);

  const deliveries = await t.query(api.webhooks.listWebhookDeliveriesByEndpoint, { endpointId });
  assert.equal(deliveries.length, 1);
}

async function assertWebhookArchiveAndDeleteLifecycle(
  t: ComponentTest,
  seed: OrganizationSeed,
  endpointId: Id<"webhook_endpoints">,
) {
  await assert.rejects(
    t.mutation(api.webhooks.deleteWebhookEndpoint, {
      organizationId: seed.organizationId,
      endpointId,
    }),
    /Only archived/,
  );

  await t.mutation(api.webhooks.setWebhookEndpointStatus, {
    organizationId: seed.organizationId,
    endpointId,
    status: "archived",
  });
  const archived = await t.query(api.webhooks.listWebhookEndpointsByOrganization, {
    organizationId: seed.organizationId,
    status: "archived",
  });
  assert.equal(archived.length, 1);

  await assert.rejects(
    t.mutation(api.webhooks.createWebhookDelivery, {
      endpointId,
      eventId: "evt_test_2",
      eventType: "invoice.created",
      payloadJson: JSON.stringify({ id: "inv_2" }),
    }),
    /inactive/,
  );

  await t.mutation(api.webhooks.deleteWebhookEndpoint, {
    organizationId: seed.organizationId,
    endpointId,
  });
  const afterDelete = await t.query(api.webhooks.getWebhookEndpoint, {
    endpointId,
  });
  assert.equal(afterDelete, null);
}

async function testCrossOrganizationIdorGuardSweep() {
  const t = convexTest(schema, modules);
  const orgA = await seedOrganization(t);
  const orgB = await seedOrganization(t);

  await assertCrossOrgRoleGuards(t, orgA, orgB);
  await assertCrossOrgMemberGuards(t, orgA, orgB);
  await assertCrossOrgInvitationReadGuards(t, orgA, orgB);
  await assertCrossOrgWebhookMutationGuards(t, orgA, orgB);
  await assertCrossOrgServicePrincipalGuards(t, orgA, orgB);
}

async function assertCrossOrgRoleGuards(
  t: ComponentTest,
  orgA: OrganizationSeed,
  orgB: OrganizationSeed,
) {
  const role = await t.mutation(api.organizations.ensureRole, {
    organizationId: orgA.organizationId,
    key: "disposable",
    name: "Disposable",
    permissions: ["organization:read"],
    createdBy: orgA.ownerUserId,
  });
  assert.equal(
    await t.query(api.organizations.getRole, {
      roleId: role.roleId,
      organizationId: orgB.organizationId,
    }),
    null,
  );
  assert.notEqual(
    await t.query(api.organizations.getRole, {
      roleId: role.roleId,
      organizationId: orgA.organizationId,
    }),
    null,
  );
  await assert.rejects(
    () =>
      t.mutation(api.organizations.deleteRole, {
        roleId: role.roleId,
        organizationId: orgB.organizationId,
      }),
    /Organization role not found/,
  );
}

async function assertCrossOrgMemberGuards(
  t: ComponentTest,
  orgA: OrganizationSeed,
  orgB: OrganizationSeed,
) {
  const member = await t.mutation(api.organizations.upsertMember, {
    organizationId: orgA.organizationId,
    userId: orgA.memberUserId,
    roleId: orgA.memberRoleId,
  });
  assert.equal(
    await t.query(api.organizations.getMember, {
      memberId: member.memberId,
      organizationId: orgB.organizationId,
    }),
    null,
  );
  await assert.rejects(
    () =>
      t.mutation(api.organizations.setMemberRole, {
        memberId: member.memberId,
        organizationId: orgB.organizationId,
        roleId: orgA.ownerRoleId,
      }),
    /Organization member not found/,
  );
}

async function assertCrossOrgInvitationReadGuards(
  t: ComponentTest,
  orgA: OrganizationSeed,
  orgB: OrganizationSeed,
) {
  const invite = await t.mutation(api.organizations.upsertInvitation, {
    organizationId: orgA.organizationId,
    roleId: orgA.memberRoleId,
    email: "sweep-invite@example.com",
    tokenHash: "sweep-invite-token",
    invitedBy: orgA.ownerUserId,
    expiresAt: Date.now() + 86_400_000,
  });
  assert.equal(
    await t.query(api.organizations.getInvitation, {
      invitationId: invite.invitationId,
      organizationId: orgB.organizationId,
    }),
    null,
  );
  const systemInvite = await t.query(api.organizations.getInvitationByIdForSystem, {
    invitationId: invite.invitationId,
  });
  assert.equal(systemInvite?.organizationId, orgA.organizationId);
}

async function assertCrossOrgWebhookMutationGuards(
  t: ComponentTest,
  orgA: OrganizationSeed,
  orgB: OrganizationSeed,
) {
  const endpoint = await t.mutation(api.webhooks.createWebhookEndpoint, {
    organizationId: orgA.organizationId,
    url: "https://hooks.example.com/a",
    eventTypes: ["*"],
    secret: "whsec_orgA",
  });
  await assert.rejects(
    () =>
      t.mutation(api.webhooks.rotateWebhookEndpointSecret, {
        endpointId: endpoint.endpointId,
        organizationId: orgB.organizationId,
        secret: "whsec_attacker",
      }),
    /Webhook endpoint not found/,
  );
  await assert.rejects(
    () =>
      t.mutation(api.webhooks.updateWebhookEndpoint, {
        endpointId: endpoint.endpointId,
        organizationId: orgB.organizationId,
        url: "https://evil.example.com/steal",
      }),
    /Webhook endpoint not found/,
  );
  const stillA = await t.query(api.webhooks.getWebhookEndpointWithSecret, {
    endpointId: endpoint.endpointId,
  });
  assert.equal(stillA?.secret, "whsec_orgA");
}

async function assertCrossOrgServicePrincipalGuards(
  t: ComponentTest,
  orgA: OrganizationSeed,
  orgB: OrganizationSeed,
) {
  const sp = await t.mutation(api.servicePrincipals.upsertServicePrincipal, {
    key: `sp-${crypto.randomUUID()}`,
    name: "Org A principal",
    organizationId: orgA.organizationId,
    permissions: ["organization:read"],
  });
  await assert.rejects(
    () =>
      t.mutation(api.servicePrincipals.setServicePrincipalDetails, {
        servicePrincipalId: sp.servicePrincipalId,
        actingOrganizationId: orgB.organizationId,
        permissions: ["*"],
      }),
    /Service principal not found/,
  );
  await assert.rejects(
    () =>
      t.mutation(api.servicePrincipals.setServicePrincipalStatus, {
        servicePrincipalId: sp.servicePrincipalId,
        actingOrganizationId: orgB.organizationId,
        status: "disabled",
      }),
    /Service principal not found/,
  );
}

async function seedOrganization(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const ownerUserId = await ctx.db.insert("users", {
      email: "owner@example.com",
      name: "Owner",
      emailVerified: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const memberUserId = await ctx.db.insert("users", {
      email: "member@example.com",
      name: "Member",
      emailVerified: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const organizationId = await ctx.db.insert("organizations", {
      name: "Acme",
      slug: `acme-${crypto.randomUUID()}`,
      status: "active",
      createdBy: ownerUserId,
      createdAt: now,
      updatedAt: now,
    });
    const ownerRoleId = await ctx.db.insert("organization_roles", {
      organizationId,
      key: "owner",
      name: "Owner",
      permissions: ["*"],
      isSystem: true,
      createdBy: ownerUserId,
      createdAt: now,
      updatedAt: now,
    });
    const memberRoleId = await ctx.db.insert("organization_roles", {
      organizationId,
      key: "member",
      name: "Member",
      permissions: ["organization:read"],
      isSystem: true,
      createdBy: ownerUserId,
      createdAt: now,
      updatedAt: now,
    });
    return {
      ownerUserId: ownerUserId,
      memberUserId: memberUserId,
      organizationId: organizationId,
      ownerRoleId: ownerRoleId,
      memberRoleId: memberRoleId,
    };
  });
}
