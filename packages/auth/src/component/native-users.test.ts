/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api.js";
import schema from "./schema.js";

const modules = import.meta.glob("./**/*.*s");

async function insertUser(t: ReturnType<typeof convexTest>, email: string, name: string) {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email,
      name,
      emailVerified: false,
      isActive: true,
      createdAt: 0,
      updatedAt: 0,
    }),
  );
}

async function insertIdentity(t: ReturnType<typeof convexTest>, userId: string, subject: string) {
  return await t.run(async (ctx) =>
    ctx.db.insert("auth_identities", {
      identityId: subject,
      userId,
      provider: "password",
      issuer: "native",
      subject,
      tokenIdentifier: subject,
      emailVerified: false,
      sessionId: null,
      createdAt: 0,
      updatedAt: 0,
    }),
  );
}

async function createOrganization(
  t: ReturnType<typeof convexTest>,
  userId: string,
  name: string,
  slug: string,
) {
  const { organizationId } = await t.mutation(api.organizations.upsertOrganization, {
    name,
    slug,
    createdBy: userId,
  });
  await t.mutation(api.organizations.seedDefaultRoles, {
    organizationId,
    createdBy: userId,
  });
  const ownerRole = await t.query(api.organizations.getRoleByKey, {
    organizationId,
    key: "owner",
  });
  if (!ownerRole) throw new Error("Owner role not seeded");
  await t.mutation(api.organizations.upsertMember, {
    organizationId,
    userId,
    roleId: ownerRole._id,
    status: "active",
    acceptedAt: 0,
  });
  return { organizationId, ownerRoleId: ownerRole._id };
}

describe("deleteUser", () => {
  it("is idempotent for a missing user", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t, "missing@example.com", "Missing");
    await t.mutation(api.native.users.deleteUser, { userId });
    const result = await t.mutation(api.native.users.deleteUser, { userId });
    expect(result.deleted).toBe(false);
  });

  it("deletes direct auth records owned by a user", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t, "alice@example.com", "Alice");
    await insertIdentity(t, userId, "alice-subject");
    await t.mutation(api.native.accounts.createAccount, {
      userId,
      provider: "password",
      issuer: "native",
      subject: "alice-subject",
      credentialHash: "argon2-hash",
    });
    await t.mutation(api.native.sessions.createSessionAndRefreshToken, {
      sessionId: "session-1",
      userId,
      token: "session-token",
      sessionExpiresAt: 1_000_000,
      refreshTokenHash: "refresh-hash",
      refreshTokenExpiresAt: 2_000_000,
    });
    await t.mutation(api.native.codes.createVerificationCode, {
      userId,
      type: "email_verification",
      tokenHash: "code-hash",
      expiresAt: 1_000_000,
    });

    const result = await t.mutation(api.native.users.deleteUser, { userId });
    expect(result.deleted).toBe(true);

    const identityCount = await t.run(async (ctx) => {
      let count = 0;
      for await (const _ of ctx.db
        .query("auth_identities")
        .withIndex("by_user", (q) => q.eq("userId", userId))) {
        count++;
      }
      return count;
    });
    expect(identityCount).toBe(0);

    const sessions = await t.query(api.native.sessions.listSessionsByUser, { userId });
    expect(sessions).toHaveLength(0);

    const user = await t.query(api.native.users.getUserById, { userId });
    expect(user).toBeNull();
  });

  it("deletes an orphaned organization and keeps shared organizations intact", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await insertUser(t, "alice-shared@example.com", "Alice");
    const bobId = await insertUser(t, "bob-shared@example.com", "Bob");

    const { organizationId: onlyAliceOrg } = await createOrganization(
      t,
      aliceId,
      "Alice Solo",
      "alice-solo",
    );
    const { organizationId: sharedOrg } = await createOrganization(
      t,
      aliceId,
      "Alice and Bob",
      "alice-bob",
    );
    const memberRole = await t.query(api.organizations.getRoleByKey, {
      organizationId: sharedOrg,
      key: "member",
    });
    if (!memberRole) throw new Error("Member role not seeded");
    await t.mutation(api.organizations.upsertMember, {
      organizationId: sharedOrg,
      userId: bobId,
      roleId: memberRole._id,
      status: "active",
      acceptedAt: 0,
    });

    await t.mutation(api.native.users.deleteUser, { userId: aliceId });

    const onlyAliceOrgNow = await t.query(api.organizations.getOrganization, {
      organizationId: onlyAliceOrg,
    });
    expect(onlyAliceOrgNow).toBeNull();

    const sharedOrgNow = await t.query(api.organizations.getOrganization, {
      organizationId: sharedOrg,
    });
    expect(sharedOrgNow).not.toBeNull();

    const sharedMembers = await t.query(api.organizations.listMembersByOrganization, {
      organizationId: sharedOrg,
    });
    expect(sharedMembers.some((m) => m.userId === aliceId)).toBe(false);
    expect(sharedMembers.some((m) => m.userId === bobId)).toBe(true);

    const bob = await t.query(api.native.users.getUserById, { userId: bobId });
    expect(bob).not.toBeNull();
  });

  it("deletes user-owned api keys, service principals, and webhooks", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t, "carol@example.com", "Carol");
    const { organizationId } = await createOrganization(t, userId, "Carol Org", "carol-org");

    const { apiKeyId } = await t.mutation(api.apiKeys.issueApiKey, {
      organizationId,
      userId,
      name: "Carol Key",
      environment: "production",
      scopes: ["data:read"],
    });

    const { servicePrincipalId } = await t.mutation(api.servicePrincipals.upsertServicePrincipal, {
      key: "carol-service",
      name: "Carol Service",
      organizationId,
      createdBy: userId,
      permissions: ["data:read"],
    });

    const { endpointId } = await t.mutation(api.webhooks.createWebhookEndpoint, {
      organizationId,
      url: "https://example.com/webhook",
      eventTypes: ["user.created"],
      secret: "shh",
      createdBy: userId,
    });

    await t.run(async (ctx) =>
      ctx.db.insert("webhook_deliveries", {
        endpointId,
        eventId: "evt-1",
        eventType: "user.created",
        payloadJson: "{}",
        status: "pending",
        attemptCount: 0,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    await t.mutation(api.native.users.deleteUser, { userId });

    const key = await t.query(api.apiKeys.getApiKey, { apiKeyId });
    expect(key).toBeNull();

    const sp = await t.query(api.servicePrincipals.getServicePrincipal, {
      servicePrincipalId,
    });
    expect(sp).toBeNull();

    const endpoint = await t.query(api.webhooks.getWebhookEndpoint, { endpointId });
    expect(endpoint).toBeNull();

    const deliveryCount = await t.run(async (ctx) => {
      let count = 0;
      for await (const _ of ctx.db
        .query("webhook_deliveries")
        .withIndex("by_endpoint", (q) => q.eq("endpointId", endpointId))) {
        count++;
      }
      return count;
    });
    expect(deliveryCount).toBe(0);

    const org = await t.query(api.organizations.getOrganization, { organizationId });
    expect(org).toBeNull();
  });

  it("does not delete another user's records", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await insertUser(t, "alice-isolated@example.com", "Alice");
    const bobId = await insertUser(t, "bob-isolated@example.com", "Bob");

    await t.mutation(api.native.accounts.createAccount, {
      userId: bobId,
      provider: "password",
      issuer: "native",
      subject: "bob-subject",
      credentialHash: "bob-hash",
    });

    await t.mutation(api.native.users.deleteUser, { userId: aliceId });

    const bob = await t.query(api.native.users.getUserById, { userId: bobId });
    expect(bob).not.toBeNull();

    const bobAccountCount = await t.run(async (ctx) => {
      let count = 0;
      for await (const _ of ctx.db
        .query("authAccounts")
        .withIndex("by_user", (q) => q.eq("userId", bobId))) {
        count++;
      }
      return count;
    });
    expect(bobAccountCount).toBe(1);
  });
});
