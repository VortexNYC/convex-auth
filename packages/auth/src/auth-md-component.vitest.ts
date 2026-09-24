import assert from "node:assert/strict";

import { convexTest } from "convex-test";
import { afterEach, describe, it, vi } from "vitest";

import {
  createAuthMdServiceAuthChallenge,
  hashAuthMdLoginHint,
  hashAuthMdSecret,
  hashAuthMdUserCode,
} from "./auth-md";
import { api } from "./component/_generated/api";
import type { Id } from "./component/_generated/dataModel";
import schema from "./component/schema";

const modules = {
  "./component/_generated/api.ts": () => import("./component/_generated/api"),
  "./component/_generated/dataModel.ts": () => import("./component/_generated/dataModel"),
  "./component/_generated/server.ts": () => import("./component/_generated/server"),
  "./component/authMd.ts": () => import("./component/authMd"),
};

afterEach(() => {
  vi.useRealTimers();
});

describe("Convex-native auth.md service_auth authority", () => {
  it("claims through a verified Convex account, exchanges once, and revokes immediately", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = 1_800_000_000_000;
    vi.setSystemTime(now);
    const t = convexTest(schema, modules);
    const seed = await seedAuthority(t);
    const challenge = await createAuthMdServiceAuthChallenge({ now });
    const registration = await register(t, {
      challenge,
      loginHint: seed.ownerEmail,
    });

    const stored = await t.run(async (ctx) => {
      const id = ctx.db.normalizeId("auth_md_registrations", registration.registrationId);
      assert.ok(id !== null);
      return await ctx.db.get("auth_md_registrations", id);
    });
    assert.ok(stored !== null);
    assert.equal(stored.loginHintHash, await hashAuthMdLoginHint(seed.ownerEmail));
    assert.ok(!Object.values(stored).includes(seed.ownerEmail));
    assert.ok(!Object.values(stored).includes(challenge.claimToken));
    assert.ok(!Object.values(stored).includes(challenge.claimViewToken));
    assert.ok(!Object.values(stored).includes(challenge.userCode));

    assert.deepEqual(
      await t.mutation(api.authMd.completeServiceAuthClaim, {
        claimViewTokenHash: challenge.claimViewTokenHash,
        userCodeHash: challenge.userCodeHash,
        userId: seed.ownerUserId,
        organizationId: seed.organizationId,
      }),
      { ok: true, status: "claimed" },
    );

    vi.setSystemTime(now + 5_000);
    const poll = await t.mutation(api.authMd.pollServiceAuthClaim, {
      claimTokenHash: challenge.claimTokenHash,
    });
    assert.equal(poll.status, "claimed");
    if (poll.status !== "claimed") throw new Error("Expected claimed poll");

    vi.setSystemTime(now + 10_000);
    assert.deepEqual(
      await t.mutation(api.authMd.pollServiceAuthClaim, {
        claimTokenHash: challenge.claimTokenHash,
      }),
      { status: "expired_token" },
    );

    const assertionId = await normalizeAssertionId(t, poll.assertionId);
    const credential = await t.mutation(api.authMd.consumeServiceAuthAssertion, {
      assertionId,
      credentialExpiresInSeconds: 3600,
    });
    const credentialId = await normalizeCredentialId(t, credential.credentialId);
    assert.deepEqual(
      await t.query(api.authMd.introspectServiceAuthCredential, {
        credentialId,
      }),
      {
        active: true,
        credentialId,
        registrationId: registration.registrationId,
        resource: "https://chat.convex.nyc/",
        userId: seed.ownerUserId,
        organizationId: seed.organizationId,
        scopes: ["chat:read", "chat:write"],
        expiresAt: now + 10_000 + 3_600_000,
      },
    );
    await assert.rejects(
      t.mutation(api.authMd.consumeServiceAuthAssertion, {
        assertionId,
        credentialExpiresInSeconds: 3600,
      }),
      /invalid or consumed/,
    );
    await t.mutation(api.authMd.revokeServiceAuthCredentialAsHolder, {
      credentialId,
    });
    assert.deepEqual(
      await t.query(api.authMd.introspectServiceAuthCredential, {
        credentialId,
      }),
      { active: false },
    );
  });

  it("requires exact verified-account and active-organization authority", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = 1_800_100_000_000;
    vi.setSystemTime(now);
    const t = convexTest(schema, modules);
    const seed = await seedAuthority(t);
    const outsider = await seedUser(t, "outsider@example.com");
    const challenge = await createAuthMdServiceAuthChallenge({ now });
    await register(t, { challenge, loginHint: seed.ownerEmail });

    assert.deepEqual(
      await t.mutation(api.authMd.completeServiceAuthClaim, {
        claimViewTokenHash: challenge.claimViewTokenHash,
        userCodeHash: challenge.userCodeHash,
        userId: outsider,
        organizationId: seed.organizationId,
      }),
      { ok: false, reason: "invalid_claim" },
    );
    for (let attempt = 0; attempt < 4; attempt += 1) {
      assert.deepEqual(
        await t.mutation(api.authMd.completeServiceAuthClaim, {
          claimViewTokenHash: challenge.claimViewTokenHash,
          userCodeHash: await hashAuthMdSecret(`wrong-${attempt}`),
          userId: seed.ownerUserId,
          organizationId: seed.organizationId,
        }),
        { ok: false, reason: "invalid_claim" },
      );
    }
    assert.deepEqual(
      await t.mutation(api.authMd.completeServiceAuthClaim, {
        claimViewTokenHash: challenge.claimViewTokenHash,
        userCodeHash: challenge.userCodeHash,
        userId: seed.ownerUserId,
        organizationId: seed.organizationId,
      }),
      { ok: false, reason: "invalid_claim" },
      "five failed attempts permanently close the ceremony",
    );
    assert.deepEqual(
      await t.mutation(api.authMd.pollServiceAuthClaim, {
        claimTokenHash: challenge.claimTokenHash,
      }),
      { status: "expired_token" },
    );
  });

  it("serializes concurrent polls and assertion consumption", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = 1_800_200_000_000;
    vi.setSystemTime(now);
    const t = convexTest(schema, modules);
    const seed = await seedAuthority(t);
    const challenge = await createAuthMdServiceAuthChallenge({ now });
    await register(t, { challenge, loginHint: seed.ownerEmail });
    await t.mutation(api.authMd.completeServiceAuthClaim, {
      claimViewTokenHash: challenge.claimViewTokenHash,
      userCodeHash: await hashAuthMdUserCode(challenge.userCode),
      userId: seed.ownerUserId,
      organizationId: seed.organizationId,
    });
    vi.setSystemTime(now + 5_000);
    const polls = await Promise.all([
      t.mutation(api.authMd.pollServiceAuthClaim, {
        claimTokenHash: challenge.claimTokenHash,
      }),
      t.mutation(api.authMd.pollServiceAuthClaim, {
        claimTokenHash: challenge.claimTokenHash,
      }),
    ]);
    assert.deepEqual(polls.map((result) => result.status).toSorted(), ["claimed", "expired_token"]);
    const claimed = polls.find((result) => result.status === "claimed");
    assert.ok(claimed?.status === "claimed");
    const assertionId = await normalizeAssertionId(t, claimed.assertionId);
    const consumptions = await Promise.allSettled([
      t.mutation(api.authMd.consumeServiceAuthAssertion, {
        assertionId,
        credentialExpiresInSeconds: 60,
      }),
      t.mutation(api.authMd.consumeServiceAuthAssertion, {
        assertionId,
        credentialExpiresInSeconds: 60,
      }),
    ]);
    assert.equal(consumptions.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(consumptions.filter((result) => result.status === "rejected").length, 1);
  });

  it("makes user, membership, organization, and registration revocation authoritative", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = 1_800_300_000_000;
    vi.setSystemTime(now);
    const t = convexTest(schema, modules);
    const seed = await seedAuthority(t);
    const first = await issueCredential(t, seed, now);
    await t.run(async (ctx) => {
      await ctx.db.patch("users", seed.ownerUserId, { isActive: false });
    });
    assert.deepEqual(
      await t.query(api.authMd.introspectServiceAuthCredential, {
        credentialId: first.credentialId,
      }),
      { active: false },
    );

    await t.run(async (ctx) => {
      await ctx.db.patch("users", seed.ownerUserId, { isActive: true });
      await ctx.db.patch("organization_members", seed.membershipId, {
        status: "suspended",
      });
    });
    assert.deepEqual(
      await t.query(api.authMd.introspectServiceAuthCredential, {
        credentialId: first.credentialId,
      }),
      { active: false },
    );

    await t.run(async (ctx) => {
      await ctx.db.patch("organization_members", seed.membershipId, {
        status: "active",
      });
      await ctx.db.patch("organizations", seed.organizationId, {
        status: "suspended",
      });
    });
    assert.deepEqual(
      await t.query(api.authMd.introspectServiceAuthCredential, {
        credentialId: first.credentialId,
      }),
      { active: false },
    );

    await t.run(async (ctx) => {
      await ctx.db.patch("organizations", seed.organizationId, {
        status: "active",
      });
    });
    const registrationId = await normalizeRegistrationId(t, first.registrationId);
    await t.mutation(api.authMd.revokeServiceAuthRegistration, {
      registrationId,
      actorUserId: seed.ownerUserId,
    });
    assert.deepEqual(
      await t.query(api.authMd.introspectServiceAuthCredential, {
        credentialId: first.credentialId,
      }),
      { active: false },
    );
  });

  it("expires abandoned ceremonies and rejects unauthorized operator revocation", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = 1_800_400_000_000;
    vi.setSystemTime(now);
    const t = convexTest(schema, modules);
    const seed = await seedAuthority(t);
    const expiringChallenge = await createAuthMdServiceAuthChallenge({
      now,
      expiresIn: 5,
      userCodeExpiresIn: 5,
    });
    await register(t, {
      challenge: expiringChallenge,
      loginHint: seed.ownerEmail,
    });
    vi.setSystemTime(now + 5_001);
    assert.deepEqual(
      await t.mutation(api.authMd.pollServiceAuthClaim, {
        claimTokenHash: expiringChallenge.claimTokenHash,
      }),
      { status: "expired_token" },
    );

    vi.setSystemTime(now + 10_000);
    const issued = await issueCredential(t, seed, now + 10_000);
    const viewerUserId = await seedOrganizationViewer(t, seed.organizationId);
    const registrationId = await normalizeRegistrationId(t, issued.registrationId);
    await assert.rejects(
      t.mutation(api.authMd.revokeServiceAuthRegistration, {
        registrationId,
        actorUserId: viewerUserId,
      }),
      /cannot revoke/,
    );
    assert.equal(
      (
        await t.query(api.authMd.introspectServiceAuthCredential, {
          credentialId: issued.credentialId,
        })
      ).active,
      true,
    );
  });
});

async function issueCredential(
  t: ReturnType<typeof convexTest>,
  seed: Awaited<ReturnType<typeof seedAuthority>>,
  now: number,
) {
  const challenge = await createAuthMdServiceAuthChallenge({ now });
  const registration = await register(t, {
    challenge,
    loginHint: seed.ownerEmail,
  });
  await t.mutation(api.authMd.completeServiceAuthClaim, {
    claimViewTokenHash: challenge.claimViewTokenHash,
    userCodeHash: challenge.userCodeHash,
    userId: seed.ownerUserId,
    organizationId: seed.organizationId,
  });
  vi.setSystemTime(now + 5_000);
  const poll = await t.mutation(api.authMd.pollServiceAuthClaim, {
    claimTokenHash: challenge.claimTokenHash,
  });
  assert.ok(poll.status === "claimed");
  const assertionId = await normalizeAssertionId(t, poll.assertionId);
  const credential = await t.mutation(api.authMd.consumeServiceAuthAssertion, {
    assertionId,
    credentialExpiresInSeconds: 3600,
  });
  return {
    registrationId: registration.registrationId,
    credentialId: await normalizeCredentialId(t, credential.credentialId),
  };
}

async function register(
  t: ReturnType<typeof convexTest>,
  input: {
    challenge: Awaited<ReturnType<typeof createAuthMdServiceAuthChallenge>>;
    loginHint: string;
  },
) {
  return await t.mutation(api.authMd.registerServiceAuth, {
    resource: "https://chat.convex.nyc",
    loginHintHash: await hashAuthMdLoginHint(input.loginHint),
    scopes: ["chat:write", "chat:read"],
    claimTokenHash: input.challenge.claimTokenHash,
    claimViewTokenHash: input.challenge.claimViewTokenHash,
    userCodeHash: input.challenge.userCodeHash,
    expiresAt: input.challenge.expiresAt,
    userCodeExpiresAt: input.challenge.userCodeExpiresAt,
    pollIntervalSeconds: input.challenge.interval,
  });
}

async function seedAuthority(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const ownerEmail = "owner@example.com";
    const ownerUserId = await ctx.db.insert("users", {
      email: ownerEmail,
      name: "Owner",
      emailVerified: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const organizationId = await ctx.db.insert("organizations", {
      name: "Convex",
      slug: `convex-${crypto.randomUUID()}`,
      status: "active",
      createdBy: ownerUserId,
      createdAt: now,
      updatedAt: now,
    });
    const roleId = await ctx.db.insert("organization_roles", {
      organizationId,
      key: "owner",
      name: "Owner",
      permissions: ["agents:configure", "agents:invoke"],
      isSystem: true,
      createdBy: ownerUserId,
      createdAt: now,
      updatedAt: now,
    });
    const membershipId = await ctx.db.insert("organization_members", {
      organizationId,
      userId: ownerUserId,
      roleId,
      status: "active",
      assignedBy: ownerUserId,
      createdAt: now,
      updatedAt: now,
    });
    return {
      membershipId,
      organizationId,
      ownerEmail,
      ownerRoleId: roleId,
      ownerUserId,
    };
  });
}

async function seedUser(t: ReturnType<typeof convexTest>, email: string): Promise<Id<"users">> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("users", {
      email,
      emailVerified: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  });
}

async function seedOrganizationViewer(
  t: ReturnType<typeof convexTest>,
  organizationId: Id<"organizations">,
): Promise<Id<"users">> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      email: `viewer-${crypto.randomUUID()}@example.com`,
      emailVerified: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const roleId = await ctx.db.insert("organization_roles", {
      organizationId,
      key: `viewer-${crypto.randomUUID()}`,
      name: "Viewer",
      permissions: ["agents:invoke"],
      isSystem: false,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("organization_members", {
      organizationId,
      userId,
      roleId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    return userId;
  });
}

async function normalizeRegistrationId(
  t: ReturnType<typeof convexTest>,
  value: string,
): Promise<Id<"auth_md_registrations">> {
  return await t.run(async (ctx) => {
    const id = ctx.db.normalizeId("auth_md_registrations", value);
    if (id === null) throw new Error("Invalid auth.md registration id");
    return id;
  });
}

async function normalizeAssertionId(
  t: ReturnType<typeof convexTest>,
  value: string,
): Promise<Id<"auth_md_assertions">> {
  return await t.run(async (ctx) => {
    const id = ctx.db.normalizeId("auth_md_assertions", value);
    if (id === null) throw new Error("Invalid auth.md assertion id");
    return id;
  });
}

async function normalizeCredentialId(
  t: ReturnType<typeof convexTest>,
  value: string,
): Promise<Id<"auth_md_credentials">> {
  return await t.run(async (ctx) => {
    const id = ctx.db.normalizeId("auth_md_credentials", value);
    if (id === null) throw new Error("Invalid auth.md credential id");
    return id;
  });
}
