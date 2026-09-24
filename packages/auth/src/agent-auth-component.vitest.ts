import assert from "node:assert/strict";

import { convexTest } from "convex-test";
import { calculateJwkThumbprint, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, it, vi } from "vitest";

import {
  createConvexAgentCredentialAuthorityAdapter,
  resolveActiveAgentPrincipal,
} from "./convex-runtime/agent-auth";
import {
  createConvexAgentAuthProtocolAuthorityAdapter,
  createConvexAgentAuthProtocolHostRequestAuthorityAdapter,
  resolveAgentAuthProtocolAgentPrincipal,
  resolveAgentAuthProtocolHostRequest,
} from "./agent-auth-protocol-convex";
import {
  createAgentAuthDeviceAuthorizationChallenge,
  hashAgentAuthDeviceAuthorizationCode,
  normalizeAgentAuthUserCode,
} from "./agent-auth-protocol/device-authorization";
import { api, internal } from "./component/_generated/api";
import schema from "./component/schema";

const modules = {
  "./component/_generated/api.ts": () => import("./component/_generated/api"),
  "./component/_generated/dataModel.ts": () => import("./component/_generated/dataModel"),
  "./component/_generated/server.ts": () => import("./component/_generated/server"),
  "./component/agentAuth.ts": () => import("./component/agentAuth"),
};

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("Convex-native Agent Auth component", () => {
  it("registers, activates, resolves, rotates, rejects replay, and revokes", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const seed = await seedAuthority(t);
    const hostKey = await publicJwk();
    const host = await t.mutation(api.agentAuth.registerAgentHost, {
      organizationId: seed.organizationId,
      name: "Codex",
      publicJwkJson: hostKey.json,
      createdBy: seed.ownerUserId,
    });
    await t.mutation(api.agentAuth.setAgentHostStatus, {
      hostId: host.id,
      organizationId: seed.organizationId,
      status: "active",
      operatorUserId: seed.ownerUserId,
    });

    const agentKey = await credentialKey();
    const agent = await t.mutation(api.agentAuth.registerAgent, {
      hostId: host.id,
      organizationId: seed.organizationId,
      name: "Regression investigator",
      mode: "delegated",
      delegatedUserId: seed.ownerUserId,
      publicJwkJson: agentKey.json,
      permissions: ["agents:configure", "agents:invoke"],
      requestedGrants: [
        {
          capability: "sentry:investigate",
          constraintsJson: JSON.stringify({ severity: { in: ["fatal"] } }),
        },
      ],
    });
    await t.mutation(api.agentAuth.setAgentStatus, {
      agentId: agent.id,
      organizationId: seed.organizationId,
      status: "active",
      operatorUserId: seed.ownerUserId,
    });
    assert.equal(
      await t.run(async (ctx) => {
        const grant = await ctx.db
          .query("agent_capability_grants")
          .withIndex("by_agent_capability", (q) =>
            q.eq("agentId", agent.id).eq("capability", "sentry:investigate"),
          )
          .unique();
        return grant?.status;
      }),
      "pending",
      "agent activation must not approve requested capabilities",
    );
    await t.mutation(api.agentAuth.setAgentCapabilityGrantStatus, {
      agentId: agent.id,
      organizationId: seed.organizationId,
      capability: "sentry:investigate",
      status: "active",
      operatorUserId: seed.ownerUserId,
    });
    await assert.rejects(
      t.mutation(api.agentAuth.setAgentCapabilityGrantStatus, {
        agentId: agent.id,
        organizationId: seed.organizationId,
        capability: "sentry:investigate",
        status: "denied",
        operatorUserId: seed.ownerUserId,
      }),
      /Invalid agent capability transition/,
    );
    const authorityAdapter = createConvexAgentCredentialAuthorityAdapter({
      refs: {
        getAgentVerificationMaterial: api.agentAuth.getAgentVerificationMaterial,
        consumeAgentCredential: api.agentAuth.consumeAgentCredential,
      },
      runQuery: async (reference, args) => await t.query(reference, args),
      runMutation: async (reference, args) => {
        const ids = await t.run(async (ctx) => ({
          agentId: ctx.db.normalizeId("agents", args.agentId),
          requestedOrganizationId:
            args.requestedOrganizationId === undefined
              ? undefined
              : ctx.db.normalizeId("organizations", args.requestedOrganizationId),
        }));
        const normalizedAgentId = ids.agentId;
        const normalizedOrganizationId = ids.requestedOrganizationId;
        if (normalizedAgentId === null || normalizedOrganizationId === null) {
          throw new Error("Agent Auth component id normalization failed");
        }
        return await t.mutation(reference, {
          ...args,
          agentId: normalizedAgentId,
          requestedOrganizationId: normalizedOrganizationId,
        });
      },
    });
    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      permissions: ["agents:configure", "agents:invoke"],
      capabilities: ["sentry:investigate"],
    })
      .setProtectedHeader({
        alg: "EdDSA",
        typ: "JWT",
        kid: agentKey.thumbprint,
      })
      .setIssuer(agentKey.thumbprint)
      .setSubject(agent.id)
      .setAudience("https://chat.convex.nyc/agent")
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + 60)
      .setJti(crypto.randomUUID())
      .sign(agentKey.privateKey);
    const verifiedPrincipal = await resolveActiveAgentPrincipal(authorityAdapter, {
      token,
      audience: "https://chat.convex.nyc/agent",
    });
    assert.deepEqual(
      verifiedPrincipal.permissions,
      ["agents:invoke"],
      "delegated agent permissions cannot outrank the responsible human",
    );
    assert.deepEqual(
      verifiedPrincipal.capabilityGrants.map((grant) => grant.capability),
      ["sentry:investigate"],
    );

    const material = await t.query(api.agentAuth.getAgentVerificationMaterial, {
      thumbprint: agentKey.thumbprint,
    });
    assert.equal(material?.agentId, agent.id);
    const first = await t.mutation(api.agentAuth.consumeAgentCredential, {
      agentId: agent.id,
      keyGeneration: 1,
      replayIdHash: "replay-hash-1",
      replayExpiresAt: Date.now() + 60_000,
      requestedOrganizationId: seed.organizationId,
      claimedPermissions: ["agents:invoke", "agents:configure"],
      claimedCapabilities: ["sentry:investigate", "posthog:measure"],
    });
    assert.equal(first.kind, "agent");
    assert.equal(first.delegatedUserId, seed.ownerUserId);
    assert.deepEqual(first.permissions, ["agents:invoke"]);
    assert.equal(first.capabilityGrants.length, 1);

    await assert.rejects(
      t.mutation(api.agentAuth.consumeAgentCredential, {
        agentId: agent.id,
        keyGeneration: 1,
        replayIdHash: "replay-hash-1",
        replayExpiresAt: Date.now() + 60_000,
        claimedPermissions: ["agents:invoke"],
        claimedCapabilities: ["sentry:investigate"],
      }),
      /replayed/,
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("agent_replay_records", {
        agentId: agent.id,
        replayIdHash: "already-expired",
        expiresAt: Date.now() - 1,
        createdAt: Date.now() - 60_000,
      });
    });
    assert.deepEqual(
      await t.mutation(api.agentAuth.cleanupExpiredAgentReplayRecords, {
        limit: 10,
      }),
      { deleted: 1 },
    );
    await assert.rejects(
      t.mutation(api.agentAuth.consumeAgentCredential, {
        agentId: agent.id,
        keyGeneration: 1,
        replayIdHash: "replay-hash-1",
        replayExpiresAt: Date.now() + 60_000,
        claimedPermissions: ["agents:invoke"],
        claimedCapabilities: ["sentry:investigate"],
      }),
      /replayed/,
      "cleanup must preserve replay records for live credentials",
    );
    await t.run(async (ctx) => {
      await ctx.db.patch("organization_roles", seed.ownerRoleId, {
        permissions: [],
        updatedAt: Date.now(),
      });
    });
    const afterRoleDowngrade = await t.mutation(api.agentAuth.consumeAgentCredential, {
      agentId: agent.id,
      keyGeneration: 1,
      replayIdHash: "after-role-downgrade",
      replayExpiresAt: Date.now() + 60_000,
      claimedPermissions: ["agents:invoke"],
      claimedCapabilities: [],
    });
    assert.deepEqual(
      afterRoleDowngrade.permissions,
      [],
      "delegated owner role downgrades must apply on the next operation",
    );
    await t.mutation(api.agentAuth.setAgentCapabilityGrantStatus, {
      agentId: agent.id,
      organizationId: seed.organizationId,
      capability: "sentry:investigate",
      status: "revoked",
      operatorUserId: seed.ownerUserId,
    });
    const afterGrantRevocation = await t.mutation(api.agentAuth.consumeAgentCredential, {
      agentId: agent.id,
      keyGeneration: 1,
      replayIdHash: "after-grant-revocation",
      replayExpiresAt: Date.now() + 60_000,
      claimedPermissions: [],
      claimedCapabilities: ["sentry:investigate"],
    });
    assert.deepEqual(afterGrantRevocation.capabilityGrants, []);
    await t.run(async (ctx) => {
      await ctx.db.patch("users", seed.ownerUserId, {
        isActive: false,
        updatedAt: Date.now(),
      });
    });
    await assert.rejects(
      t.mutation(api.agentAuth.consumeAgentCredential, {
        agentId: agent.id,
        keyGeneration: 1,
        replayIdHash: "suspended-owner",
        replayExpiresAt: Date.now() + 60_000,
        claimedPermissions: [],
        claimedCapabilities: [],
      }),
      /User is not active/,
    );
    await t.run(async (ctx) => {
      await ctx.db.patch("users", seed.ownerUserId, {
        isActive: true,
        updatedAt: Date.now(),
      });
    });
    await assert.rejects(
      t.mutation(api.agentAuth.cleanupExpiredAgentReplayRecords, {
        limit: 101,
      }),
      /limit must be between/,
    );

    const nextKey = await publicJwk();
    await t.mutation(api.agentAuth.rotateAgentKey, {
      agentId: agent.id,
      organizationId: seed.organizationId,
      expectedGeneration: 1,
      publicJwkJson: nextKey.json,
      operatorUserId: seed.ownerUserId,
    });
    await assert.rejects(
      t.mutation(api.agentAuth.consumeAgentCredential, {
        agentId: agent.id,
        keyGeneration: 1,
        replayIdHash: "old-key",
        replayExpiresAt: Date.now() + 60_000,
        claimedPermissions: ["agents:invoke"],
        claimedCapabilities: ["sentry:investigate"],
      }),
      /key generation/,
    );

    await t.mutation(api.agentAuth.setAgentHostStatus, {
      hostId: host.id,
      organizationId: seed.organizationId,
      status: "revoked",
      operatorUserId: seed.ownerUserId,
    });
    await assert.rejects(
      t.mutation(api.agentAuth.consumeAgentCredential, {
        agentId: agent.id,
        keyGeneration: 2,
        replayIdHash: "revoked-host",
        replayExpiresAt: Date.now() + 60_000,
        claimedPermissions: ["agents:invoke"],
        claimedCapabilities: ["sentry:investigate"],
      }),
      /host is not active/,
    );
  });

  it("atomically rejects 63 of 64 concurrent protocol JWT replays", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedAuthority(t);
    const hostKey = await credentialKey();
    const host = await t.mutation(api.agentAuth.registerAgentHost, {
      organizationId: seed.organizationId,
      name: "Protocol host",
      publicJwkJson: hostKey.json,
      createdBy: seed.ownerUserId,
    });
    await t.mutation(api.agentAuth.setAgentHostStatus, {
      hostId: host.id,
      organizationId: seed.organizationId,
      status: "active",
      operatorUserId: seed.ownerUserId,
    });
    const agentKey = await credentialKey();
    const agent = await t.mutation(api.agentAuth.registerAgent, {
      hostId: host.id,
      organizationId: seed.organizationId,
      name: "Protocol agent",
      mode: "delegated",
      delegatedUserId: seed.ownerUserId,
      publicJwkJson: agentKey.json,
      permissions: ["agents:invoke"],
      requestedGrants: [{ capability: "sentry:investigate" }],
    });
    await t.mutation(api.agentAuth.setAgentStatus, {
      agentId: agent.id,
      organizationId: seed.organizationId,
      status: "active",
      operatorUserId: seed.ownerUserId,
    });
    await t.mutation(api.agentAuth.setAgentCapabilityGrantStatus, {
      agentId: agent.id,
      organizationId: seed.organizationId,
      capability: "sentry:investigate",
      status: "active",
      operatorUserId: seed.ownerUserId,
    });
    const adapter = createConvexAgentAuthProtocolAuthorityAdapter({
      refs: {
        getAgentProtocolVerificationMaterial: api.agentAuth.getAgentProtocolVerificationMaterial,
        consumeAgentCredential: api.agentAuth.consumeAgentCredential,
      },
      runQuery: async (reference, args) => {
        const normalizedAgentId = await t.run(
          async (ctx) => await Promise.resolve(ctx.db.normalizeId("agents", args.agentId)),
        );
        if (normalizedAgentId === null) return null;
        return await t.query(reference, {
          ...args,
          agentId: normalizedAgentId,
        });
      },
      runMutation: async (reference, args) => {
        const ids = await t.run(async (ctx) => ({
          agentId: ctx.db.normalizeId("agents", args.agentId),
          requestedOrganizationId:
            args.requestedOrganizationId === undefined
              ? undefined
              : ctx.db.normalizeId("organizations", args.requestedOrganizationId),
        }));
        if (ids.agentId === null || ids.requestedOrganizationId === null) {
          throw new Error("Agent Auth Protocol id normalization failed");
        }
        return await t.mutation(reference, {
          ...args,
          agentId: ids.agentId,
          requestedOrganizationId: ids.requestedOrganizationId,
        });
      },
    });
    const audience = "https://auth.convex.nyc/capability/execute";
    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "EdDSA", typ: "agent+jwt" })
      .setIssuer(hostKey.thumbprint)
      .setSubject(agent.id)
      .setAudience(audience)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + 60)
      .setJti("one-credential-used-32-times")
      .sign(agentKey.privateKey);
    const attempts = await Promise.allSettled(
      Array.from(
        { length: 64 },
        async () =>
          await resolveAgentAuthProtocolAgentPrincipal(adapter, {
            token,
            audience,
            requestedOrganizationId: seed.organizationId,
          }),
      ),
    );
    const winners = attempts.filter((attempt) => attempt.status === "fulfilled");
    const denials = attempts.filter((attempt) => attempt.status === "rejected");
    assert.equal(
      winners.length,
      1,
      JSON.stringify(
        attempts.map((attempt) =>
          attempt.status === "rejected" ? String(attempt.reason) : "fulfilled",
        ),
      ),
    );
    assert.equal(denials.length, 63);
    const winner = winners[0];
    assert.ok(winner !== undefined && winner.status === "fulfilled");
    assert.deepEqual(winner.value.permissions, ["agents:invoke"]);
    assert.deepEqual(
      winner.value.capabilityGrants.map((grant) => grant.capability),
      ["sentry:investigate"],
      "omitting protocol capabilities means no credential-level narrowing",
    );
    for (const denial of denials) {
      assert.ok(denial.status === "rejected");
      assert.match(String(denial.reason), /replayed/);
    }

    const narrowedToken = await new SignJWT({ capabilities: [] })
      .setProtectedHeader({ alg: "EdDSA", typ: "agent+jwt" })
      .setIssuer(hostKey.thumbprint)
      .setSubject(agent.id)
      .setAudience(audience)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + 60)
      .setJti("explicit-empty-capability-set")
      .sign(agentKey.privateKey);
    const narrowedPrincipal = await resolveAgentAuthProtocolAgentPrincipal(adapter, {
      token: narrowedToken,
      audience,
    });
    assert.deepEqual(
      narrowedPrincipal.capabilityGrants,
      [],
      "an explicit empty protocol capability list narrows every stored grant",
    );

    const materialBeforeRotation = await t.query(
      api.agentAuth.getAgentProtocolVerificationMaterial,
      {
        agentId: agent.id,
        hostThumbprint: hostKey.thumbprint,
      },
    );
    assert.ok(materialBeforeRotation !== null);
    const rotatedHostKey = await publicJwk();
    await t.mutation(api.agentAuth.rotateAgentHostKey, {
      hostId: host.id,
      organizationId: seed.organizationId,
      expectedGeneration: 1,
      publicJwkJson: rotatedHostKey.json,
      operatorUserId: seed.ownerUserId,
    });
    await assert.rejects(
      t.mutation(api.agentAuth.consumeAgentCredential, {
        agentId: agent.id,
        keyGeneration: materialBeforeRotation.agentKeyGeneration,
        hostKeyGeneration: materialBeforeRotation.hostKeyGeneration,
        replayIdHash: "host-rotation-between-query-and-write",
        replayExpiresAt: Date.now() + 60_000,
      }),
      /host key generation/,
      "the authority transaction rechecks host rotation after key lookup",
    );
    const staleHostToken = await new SignJWT({})
      .setProtectedHeader({ alg: "EdDSA", typ: "agent+jwt" })
      .setIssuer(hostKey.thumbprint)
      .setSubject(agent.id)
      .setAudience(audience)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + 60)
      .setJti("stale-host-generation")
      .sign(agentKey.privateKey);
    await assert.rejects(
      resolveAgentAuthProtocolAgentPrincipal(adapter, {
        token: staleHostToken,
        audience,
      }),
      /authority is unknown/,
      "host rotation invalidates agent JWTs carrying the retired host issuer",
    );
  });

  it("atomically authenticates one of 64 identical host requests", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedAuthority(t);
    const outsider = await seedAuthority(t);
    const hostKey = await credentialKey();
    const host = await t.mutation(api.agentAuth.registerAgentHost, {
      organizationId: seed.organizationId,
      name: "Signed protocol host",
      publicJwkJson: hostKey.json,
      createdBy: seed.ownerUserId,
    });
    await t.mutation(api.agentAuth.setAgentHostStatus, {
      hostId: host.id,
      organizationId: seed.organizationId,
      status: "active",
      operatorUserId: seed.ownerUserId,
    });
    const adapter = createConvexAgentAuthProtocolHostRequestAuthorityAdapter({
      refs: {
        getAgentHostProtocolVerificationMaterial:
          api.agentAuth.getAgentHostProtocolVerificationMaterial,
        consumeAgentHostRequest: api.agentAuth.consumeAgentHostRequest,
      },
      runQuery: async (reference, args) => await t.query(reference, args),
      runMutation: async (reference, args) => {
        const ids = await t.run(async (ctx) => ({
          hostId: ctx.db.normalizeId("agent_hosts", args.hostId),
          organizationId:
            args.requestedOrganizationId === undefined
              ? undefined
              : ctx.db.normalizeId("organizations", args.requestedOrganizationId),
        }));
        if (ids.hostId === null || ids.organizationId === null) {
          throw new Error("Agent Auth Protocol host id normalization failed");
        }
        return await t.mutation(reference, {
          ...args,
          hostId: ids.hostId,
          requestedOrganizationId: ids.organizationId,
        });
      },
    });
    const audience = "https://auth.convex.nyc/agents/status";
    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      host_public_key: JSON.parse(hostKey.json) as unknown,
    })
      .setProtectedHeader({ alg: "EdDSA", typ: "host+jwt" })
      .setIssuer(hostKey.thumbprint)
      .setAudience(audience)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + 60)
      .setJti("host-request-replayed-64-times")
      .sign(hostKey.privateKey);
    const attempts = await Promise.allSettled(
      Array.from(
        { length: 64 },
        async () =>
          await resolveAgentAuthProtocolHostRequest(adapter, {
            token,
            audience,
            registration: false,
            requestedOrganizationId: seed.organizationId,
          }),
      ),
    );
    assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
    assert.equal(
      attempts.filter(
        (attempt) => attempt.status === "rejected" && String(attempt.reason).includes("replayed"),
      ).length,
      63,
    );

    const crossOrganizationToken = await new SignJWT({
      host_public_key: JSON.parse(hostKey.json) as unknown,
    })
      .setProtectedHeader({ alg: "EdDSA", typ: "host+jwt" })
      .setIssuer(hostKey.thumbprint)
      .setAudience(audience)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + 60)
      .setJti("host-cross-organization")
      .sign(hostKey.privateKey);
    await assert.rejects(
      resolveAgentAuthProtocolHostRequest(adapter, {
        token: crossOrganizationToken,
        audience,
        registration: false,
        requestedOrganizationId: outsider.organizationId,
      }),
      /organization mismatch/,
    );
  });

  it("admits one winner for 64 contended agent and host key rotations", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedAuthority(t);
    const hostKey = await publicJwk();
    const host = await t.mutation(api.agentAuth.registerAgentHost, {
      organizationId: seed.organizationId,
      name: "Rotation host",
      publicJwkJson: hostKey.json,
      createdBy: seed.ownerUserId,
    });
    await t.mutation(api.agentAuth.setAgentHostStatus, {
      hostId: host.id,
      organizationId: seed.organizationId,
      status: "active",
      operatorUserId: seed.ownerUserId,
    });
    const agentKey = await publicJwk();
    const agent = await t.mutation(api.agentAuth.registerAgent, {
      hostId: host.id,
      organizationId: seed.organizationId,
      name: "Rotation agent",
      mode: "autonomous",
      publicJwkJson: agentKey.json,
      permissions: [],
      requestedGrants: [],
    });
    await t.mutation(api.agentAuth.setAgentStatus, {
      agentId: agent.id,
      organizationId: seed.organizationId,
      status: "active",
      operatorUserId: seed.ownerUserId,
    });
    const agentRotationKeys = await Promise.all(
      Array.from({ length: 64 }, async () => await publicJwk()),
    );
    const agentRotations = await Promise.allSettled(
      agentRotationKeys.map(
        async (key) =>
          await t.mutation(api.agentAuth.rotateAgentKey, {
            agentId: agent.id,
            organizationId: seed.organizationId,
            expectedGeneration: 1,
            publicJwkJson: key.json,
            operatorUserId: seed.ownerUserId,
          }),
      ),
    );
    assert.equal(agentRotations.filter((rotation) => rotation.status === "fulfilled").length, 1);
    for (const rotation of agentRotations.filter((result) => result.status === "rejected")) {
      assert.match(String(rotation.reason), /generation changed/);
    }

    const hostRotationKeys = await Promise.all(
      Array.from({ length: 64 }, async () => await publicJwk()),
    );
    const hostRotations = await Promise.allSettled(
      hostRotationKeys.map(
        async (key) =>
          await t.mutation(api.agentAuth.rotateAgentHostKey, {
            hostId: host.id,
            organizationId: seed.organizationId,
            expectedGeneration: 1,
            publicJwkJson: key.json,
            operatorUserId: seed.ownerUserId,
          }),
      ),
    );
    assert.equal(hostRotations.filter((rotation) => rotation.status === "fulfilled").length, 1);
    for (const rotation of hostRotations.filter((result) => result.status === "rejected")) {
      assert.match(String(rotation.reason), /generation changed/);
    }
  });

  it("keeps autonomous agents human-free and rejects organization confusion", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedAuthority(t);
    const hostKey = await publicJwk();
    const host = await t.mutation(api.agentAuth.registerAgentHost, {
      organizationId: seed.organizationId,
      name: "Background host",
      publicJwkJson: hostKey.json,
      createdBy: seed.ownerUserId,
    });
    await t.mutation(api.agentAuth.setAgentHostStatus, {
      hostId: host.id,
      organizationId: seed.organizationId,
      status: "active",
      operatorUserId: seed.ownerUserId,
    });
    const agentKey = await publicJwk();
    await assert.rejects(
      t.mutation(api.agentAuth.registerAgent, {
        hostId: host.id,
        organizationId: seed.organizationId,
        name: "Invalid autonomous agent",
        mode: "autonomous",
        delegatedUserId: seed.ownerUserId,
        publicJwkJson: agentKey.json,
        permissions: [],
        requestedGrants: [],
      }),
      /cannot have delegatedUserId/,
    );
    await assert.rejects(
      t.mutation(api.agentAuth.registerAgent, {
        hostId: host.id,
        organizationId: seed.organizationId,
        name: "Oversized capability agent",
        mode: "autonomous",
        publicJwkJson: agentKey.json,
        permissions: [],
        requestedGrants: [
          {
            capability: "oversized",
            constraintsJson: JSON.stringify({ value: "x".repeat(16_000) }),
          },
        ],
      }),
      /Capability constraints exceed/,
    );
    const autonomousKey = await publicJwk();
    const autonomous = await t.mutation(api.agentAuth.registerAgent, {
      hostId: host.id,
      organizationId: seed.organizationId,
      name: "Autonomous agent",
      mode: "autonomous",
      publicJwkJson: autonomousKey.json,
      permissions: [],
      requestedGrants: [],
    });
    const absoluteExpiresAt = Date.now() + 60_000;
    await t.mutation(api.agentAuth.setAgentStatus, {
      agentId: autonomous.id,
      organizationId: seed.organizationId,
      status: "active",
      operatorUserId: seed.ownerUserId,
      absoluteExpiresAt,
    });
    await t.mutation(api.agentAuth.setAgentStatus, {
      agentId: autonomous.id,
      organizationId: seed.organizationId,
      status: "expired",
      operatorUserId: seed.ownerUserId,
    });
    await assert.rejects(
      t.mutation(api.agentAuth.consumeAgentCredential, {
        agentId: autonomous.id,
        keyGeneration: 1,
        replayIdHash: "expired-agent",
        replayExpiresAt: Date.now() + 60_000,
        claimedPermissions: [],
        claimedCapabilities: [],
      }),
      /Agent is not active/,
    );
    await assert.rejects(
      t.mutation(api.agentAuth.reactivateAgent, {
        agentId: autonomous.id,
        organizationId: seed.organizationId,
        operatorUserId: seed.ownerUserId,
        expiresAt: absoluteExpiresAt + 60_000,
      }),
      /reactivation expiry is invalid/,
    );
  });

  it("turns absolute-lifetime reactivation into permanent revocation", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const now = 1_800_200_000_000;
      vi.setSystemTime(now);
      const t = convexTest(schema, modules);
      const seed = await seedAuthority(t);
      const hostKey = await publicJwk();
      const host = await t.mutation(api.agentAuth.registerAgentHost, {
        organizationId: seed.organizationId,
        name: "Absolute lifetime host",
        publicJwkJson: hostKey.json,
        createdBy: seed.ownerUserId,
      });
      await t.mutation(api.agentAuth.setAgentHostStatus, {
        hostId: host.id,
        organizationId: seed.organizationId,
        status: "active",
        operatorUserId: seed.ownerUserId,
      });
      const agentKey = await publicJwk();
      const agent = await t.mutation(api.agentAuth.registerAgent, {
        hostId: host.id,
        organizationId: seed.organizationId,
        name: "Absolute lifetime agent",
        mode: "autonomous",
        publicJwkJson: agentKey.json,
        permissions: [],
        requestedGrants: [],
      });
      await t.mutation(api.agentAuth.setAgentStatus, {
        agentId: agent.id,
        organizationId: seed.organizationId,
        status: "active",
        operatorUserId: seed.ownerUserId,
        expiresAt: now + 5_000,
        absoluteExpiresAt: now + 10_000,
      });
      await t.mutation(api.agentAuth.setAgentStatus, {
        agentId: agent.id,
        organizationId: seed.organizationId,
        status: "expired",
        operatorUserId: seed.ownerUserId,
      });
      vi.setSystemTime(now + 10_001);
      assert.deepEqual(
        await t.mutation(api.agentAuth.reactivateAgent, {
          agentId: agent.id,
          organizationId: seed.organizationId,
          operatorUserId: seed.ownerUserId,
          expiresAt: now + 20_000,
        }),
        { status: "revoked" },
      );
      await assert.rejects(
        t.mutation(api.agentAuth.reactivateAgent, {
          agentId: agent.id,
          organizationId: seed.organizationId,
          operatorUserId: seed.ownerUserId,
          expiresAt: now + 20_000,
        }),
        /Only expired agents/,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("introspects only current authority and decays grants on reactivation", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedAuthority(t);
    const outsider = await seedAuthority(t);
    const hostKey = await publicJwk();
    const host = await t.mutation(api.agentAuth.registerAgentHost, {
      organizationId: seed.organizationId,
      name: "Lifecycle host",
      publicJwkJson: hostKey.json,
      createdBy: seed.ownerUserId,
    });
    await t.mutation(api.agentAuth.setAgentHostStatus, {
      hostId: host.id,
      organizationId: seed.organizationId,
      status: "active",
      operatorUserId: seed.ownerUserId,
    });
    const agentKey = await publicJwk();
    const agent = await t.mutation(api.agentAuth.registerAgent, {
      hostId: host.id,
      organizationId: seed.organizationId,
      name: "Lifecycle agent",
      mode: "delegated",
      delegatedUserId: seed.ownerUserId,
      publicJwkJson: agentKey.json,
      permissions: ["agents:configure", "agents:invoke"],
      requestedGrants: [{ capability: "sentry:investigate" }, { capability: "posthog:measure" }],
    });
    const absoluteExpiresAt = Date.now() + 120_000;
    await t.mutation(api.agentAuth.setAgentStatus, {
      agentId: agent.id,
      organizationId: seed.organizationId,
      status: "active",
      operatorUserId: seed.ownerUserId,
      expiresAt: Date.now() + 30_000,
      absoluteExpiresAt,
    });
    for (const capability of ["sentry:investigate", "posthog:measure"]) {
      await t.mutation(api.agentAuth.setAgentCapabilityGrantStatus, {
        agentId: agent.id,
        organizationId: seed.organizationId,
        capability,
        status: "active",
        operatorUserId: seed.ownerUserId,
      });
    }

    const narrowed = await t.query(api.agentAuth.introspectAgentAuthority, {
      agentId: agent.id,
      organizationId: seed.organizationId,
      claimedPermissions: ["agents:configure", "agents:invoke"],
      claimedCapabilities: ["posthog:measure", "linear:write"],
    });
    assert.equal(narrowed.active, true);
    if (!narrowed.active) throw new Error("Expected active authority");
    assert.deepEqual(narrowed.permissions, ["agents:invoke"]);
    assert.deepEqual(
      narrowed.capabilityGrants.map((grant) => grant.capability),
      ["posthog:measure"],
      "introspection claims may only narrow current Convex grants",
    );
    assert.equal(
      (
        await t.query(api.agentAuth.getAgentAuthorityStatus, {
          agentId: agent.id,
          organizationId: seed.organizationId,
        })
      )?.status,
      "active",
    );
    assert.equal(
      await t.query(api.agentAuth.getAgentAuthorityStatus, {
        agentId: agent.id,
        organizationId: outsider.organizationId,
      }),
      null,
      "cross-organization lifecycle status must reveal no agent",
    );
    assert.deepEqual(
      await t.query(api.agentAuth.introspectAgentAuthority, {
        agentId: agent.id,
        organizationId: outsider.organizationId,
      }),
      { active: false },
      "cross-organization introspection must reveal no authority",
    );
    await t.run(async (ctx) => {
      await ctx.db.patch("users", seed.ownerUserId, {
        isActive: false,
        updatedAt: Date.now(),
      });
    });
    assert.deepEqual(
      await t.query(api.agentAuth.introspectAgentAuthority, {
        agentId: agent.id,
        organizationId: seed.organizationId,
      }),
      { active: false },
      "introspection must fail closed when the responsible human is inactive",
    );
    await t.run(async (ctx) => {
      await ctx.db.patch("users", seed.ownerUserId, {
        isActive: true,
        updatedAt: Date.now(),
      });
    });

    await t.mutation(api.agentAuth.setAgentStatus, {
      agentId: agent.id,
      organizationId: seed.organizationId,
      status: "expired",
      operatorUserId: seed.ownerUserId,
    });
    assert.equal(
      (
        await t.query(api.agentAuth.getAgentAuthorityStatus, {
          agentId: agent.id,
          organizationId: seed.organizationId,
        })
      )?.status,
      "expired",
    );
    assert.deepEqual(
      await t.mutation(api.agentAuth.reactivateAgent, {
        agentId: agent.id,
        organizationId: seed.organizationId,
        operatorUserId: seed.ownerUserId,
        expiresAt: Date.now() + 30_000,
      }),
      { status: "active" },
    );
    const reactivated = await t.query(api.agentAuth.introspectAgentAuthority, {
      agentId: agent.id,
      organizationId: seed.organizationId,
    });
    assert.equal(reactivated.active, true);
    if (!reactivated.active) throw new Error("Expected reactivated authority");
    assert.deepEqual(
      reactivated.capabilityGrants,
      [],
      "reactivation restores identity without restoring product authority",
    );

    await t.mutation(api.agentAuth.setAgentStatus, {
      agentId: agent.id,
      organizationId: seed.organizationId,
      status: "revoked",
      operatorUserId: seed.ownerUserId,
    });
    assert.deepEqual(
      await t.query(api.agentAuth.introspectAgentAuthority, {
        agentId: agent.id,
        organizationId: seed.organizationId,
      }),
      { active: false },
    );
    const revokedRecords = await t.run(async (ctx) => {
      const key = await ctx.db
        .query("agent_keys")
        .withIndex("by_agent_generation", (q) => q.eq("agentId", agent.id).eq("generation", 1))
        .unique();
      const grants = await ctx.db
        .query("agent_capability_grants")
        .withIndex("by_agent_status", (q) => q.eq("agentId", agent.id))
        .take(3);
      return { key, grants };
    });
    assert.equal(revokedRecords.key?.status, "revoked");
    assert.deepEqual(
      revokedRecords.grants.map((grant) => grant.status),
      ["revoked", "revoked"],
    );
  });

  it("makes host revocation immediate and materializes descendants in bounded batches", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const seed = await seedAuthority(t);
    const hostKey = await publicJwk();
    const host = await t.mutation(api.agentAuth.registerAgentHost, {
      organizationId: seed.organizationId,
      name: "Revoked host",
      publicJwkJson: hostKey.json,
      createdBy: seed.ownerUserId,
    });
    await t.mutation(api.agentAuth.setAgentHostStatus, {
      hostId: host.id,
      organizationId: seed.organizationId,
      status: "active",
      operatorUserId: seed.ownerUserId,
    });
    const activeAgents = [];
    for (let index = 0; index < 17; index += 1) {
      const key = await publicJwk();
      const agent = await t.mutation(api.agentAuth.registerAgent, {
        hostId: host.id,
        organizationId: seed.organizationId,
        name: `Revoked child ${index}`,
        mode: "autonomous",
        publicJwkJson: key.json,
        permissions: [],
        requestedGrants: [{ capability: `test:capability:${index}` }],
      });
      await t.mutation(api.agentAuth.setAgentStatus, {
        agentId: agent.id,
        organizationId: seed.organizationId,
        status: "active",
        operatorUserId: seed.ownerUserId,
      });
      activeAgents.push(agent);
    }
    const pendingKey = await publicJwk();
    const pendingAgent = await t.mutation(api.agentAuth.registerAgent, {
      hostId: host.id,
      organizationId: seed.organizationId,
      name: "Pending child",
      mode: "autonomous",
      publicJwkJson: pendingKey.json,
      permissions: [],
      requestedGrants: [],
    });

    await t.mutation(api.agentAuth.setAgentHostStatus, {
      hostId: host.id,
      organizationId: seed.organizationId,
      status: "revoked",
      operatorUserId: seed.ownerUserId,
    });
    assert.equal(
      await t.query(api.agentAuth.getAgentProtocolVerificationMaterial, {
        agentId: activeAgents[0]!.id,
        hostThumbprint: hostKey.thumbprint,
      }),
      null,
      "host revocation must be authoritative before descendant projection",
    );

    await t.mutation(internal.agentAuth.cascadeRevokedAgentHost, {
      hostId: host.id,
      phase: "pending",
    });
    await t.mutation(internal.agentAuth.cascadeRevokedAgentHost, {
      hostId: host.id,
      phase: "active",
    });
    assert.equal(
      await t.run(async (ctx) => {
        const remaining = await ctx.db
          .query("agents")
          .withIndex("by_host_status", (q) => q.eq("hostId", host.id).eq("status", "active"))
          .take(20);
        return remaining.length;
      }),
      13,
      "one bounded batch must not fan out across every child",
    );

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const projected = await t.run(async (ctx) => {
      const revoked = await ctx.db
        .query("agents")
        .withIndex("by_host_status", (q) => q.eq("hostId", host.id).eq("status", "revoked"))
        .take(20);
      const storedHost = await ctx.db.get("agent_hosts", host.id);
      const hostKeyRecord = await ctx.db
        .query("agent_host_keys")
        .withIndex("by_host_generation", (q) => q.eq("hostId", host.id).eq("generation", 1))
        .unique();
      return { revoked, storedHost, hostKeyRecord };
    });
    assert.equal(projected.revoked.length, 18);
    assert.equal(projected.hostKeyRecord?.status, "revoked");
    assert.equal(typeof projected.storedHost?.cascadeCompletedAt, "number");
    assert.equal(
      projected.revoked.some((agent) => agent._id === pendingAgent.id),
      true,
    );
    assert.equal(
      (
        await t.query(api.agentAuth.getAgentHostAuthorityStatus, {
          hostId: host.id,
          organizationId: seed.organizationId,
        })
      )?.status,
      "revoked",
    );
  });

  it("runs bounded RFC 8628 approval without granting product capabilities", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const now = 1_800_000_000_000;
      vi.setSystemTime(now);
      const t = convexTest(schema, modules);
      const seed = await seedAuthority(t);
      const outsider = await seedAuthority(t);
      const hostKey = await publicJwk();
      const host = await t.mutation(api.agentAuth.registerAgentHost, {
        organizationId: seed.organizationId,
        name: "Device flow host",
        publicJwkJson: hostKey.json,
        createdBy: seed.ownerUserId,
      });
      await t.mutation(api.agentAuth.setAgentHostStatus, {
        hostId: host.id,
        organizationId: seed.organizationId,
        status: "active",
        operatorUserId: seed.ownerUserId,
      });
      const challenge = await createAgentAuthDeviceAuthorizationChallenge({
        now,
      });
      const agentKey = await publicJwk();
      const registration = await t.mutation(api.agentAuth.registerAgentWithDeviceAuthorization, {
        hostId: host.id,
        organizationId: seed.organizationId,
        name: "Approved through RFC 8628",
        mode: "delegated",
        delegatedUserId: seed.ownerUserId,
        publicJwkJson: agentKey.json,
        permissions: ["agents:invoke"],
        requestedGrants: [{ capability: "sentry:investigate" }],
        deviceAuthorization: {
          userCodeHash: challenge.userCodeHash,
          deviceCodeHash: challenge.deviceCodeHash,
          expiresAt: challenge.expiresAt,
          pollIntervalSeconds: challenge.interval,
        },
      });
      const stored = await t.run(async (ctx) => {
        const authorization = await ctx.db.get(
          "agent_device_authorizations",
          ctx.db.normalizeId("agent_device_authorizations", registration.authorizationId)!,
        );
        const agent = await ctx.db.get(
          "agents",
          ctx.db.normalizeId("agents", registration.agentId)!,
        );
        const grant = await ctx.db
          .query("agent_capability_grants")
          .withIndex("by_agent_capability", (q) =>
            q.eq("agentId", agent!._id).eq("capability", "sentry:investigate"),
          )
          .unique();
        return { authorization, agent, grant };
      });
      assert.equal(stored.authorization?.userCodeHash, challenge.userCodeHash);
      assert.equal(stored.authorization?.deviceCodeHash, challenge.deviceCodeHash);
      assert.equal(stored.agent?.status, "pending");
      assert.equal(stored.grant?.status, "pending");
      assert.equal(
        Object.values(stored.authorization ?? {}).includes(
          normalizeAgentAuthUserCode(challenge.userCode),
        ),
        false,
        "raw user code must never enter component storage",
      );
      assert.equal(
        Object.values(stored.authorization ?? {}).includes(challenge.deviceCode),
        false,
        "raw device code must never enter component storage",
      );

      assert.deepEqual(
        await t.mutation(api.agentAuth.pollAgentDeviceAuthorization, {
          deviceCodeHash: challenge.deviceCodeHash,
        }),
        { status: "slow_down", interval: 10 },
      );
      vi.setSystemTime(now + 10_000);
      assert.deepEqual(
        await t.mutation(api.agentAuth.pollAgentDeviceAuthorization, {
          deviceCodeHash: challenge.deviceCodeHash,
        }),
        { status: "authorization_pending", interval: 10 },
      );

      assert.deepEqual(
        await t.mutation(api.agentAuth.decideAgentDeviceAuthorization, {
          organizationId: outsider.organizationId,
          operatorUserId: outsider.ownerUserId,
          userCodeHash: challenge.userCodeHash,
          decision: "approved",
        }),
        { ok: false, reason: "invalid_code" },
      );
      assert.deepEqual(
        await t.mutation(api.agentAuth.decideAgentDeviceAuthorization, {
          organizationId: seed.organizationId,
          operatorUserId: seed.ownerUserId,
          userCodeHash: await hashAgentAuthDeviceAuthorizationCode(
            normalizeAgentAuthUserCode(challenge.userCode),
          ),
          decision: "approved",
        }),
        { ok: true, status: "approved" },
      );
      assert.deepEqual(
        await t.mutation(api.agentAuth.decideAgentDeviceAuthorization, {
          organizationId: seed.organizationId,
          operatorUserId: seed.ownerUserId,
          userCodeHash: challenge.userCodeHash,
          decision: "approved",
        }),
        { ok: false, reason: "invalid_code" },
        "approval is a one-way terminal transaction",
      );
      const approved = await t.run(async (ctx) => {
        const agentId = ctx.db.normalizeId("agents", registration.agentId)!;
        const agent = await ctx.db.get("agents", agentId);
        const grant = await ctx.db
          .query("agent_capability_grants")
          .withIndex("by_agent_capability", (q) =>
            q.eq("agentId", agentId).eq("capability", "sentry:investigate"),
          )
          .unique();
        return { agent, grant };
      });
      assert.equal(approved.agent?.status, "active");
      assert.equal(
        approved.grant?.status,
        "pending",
        "human identity approval must not create product capability authority",
      );
      assert.deepEqual(
        await t.mutation(api.agentAuth.pollAgentDeviceAuthorization, {
          deviceCodeHash: challenge.deviceCodeHash,
        }),
        { status: "approved", agentId: registration.agentId },
      );
      await assert.rejects(
        t.mutation(api.agentAuth.pollAgentDeviceAuthorization, {
          deviceCodeHash: challenge.deviceCodeHash,
        }),
        /already consumed/,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("rate limits approval guessing and expires abandoned grants", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const now = 1_800_100_000_000;
      vi.setSystemTime(now);
      const t = convexTest(schema, modules);
      const seed = await seedAuthority(t);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        assert.deepEqual(
          await t.mutation(api.agentAuth.decideAgentDeviceAuthorization, {
            organizationId: seed.organizationId,
            operatorUserId: seed.ownerUserId,
            userCodeHash: await hashAgentAuthDeviceAuthorizationCode(`wrong-${attempt}`),
            decision: "approved",
          }),
          { ok: false, reason: "invalid_code" },
        );
      }
      const blocked = await t.mutation(api.agentAuth.decideAgentDeviceAuthorization, {
        organizationId: seed.organizationId,
        operatorUserId: seed.ownerUserId,
        userCodeHash: await hashAgentAuthDeviceAuthorizationCode("blocked"),
        decision: "approved",
      });
      assert.equal(blocked.ok, false);
      assert.equal(blocked.reason, "rate_limited");
      assert.equal(typeof blocked.retryAt, "number");

      const expirySeed = await seedAuthority(t);
      const hostKey = await publicJwk();
      const host = await t.mutation(api.agentAuth.registerAgentHost, {
        organizationId: expirySeed.organizationId,
        name: "Expiry host",
        publicJwkJson: hostKey.json,
        createdBy: expirySeed.ownerUserId,
      });
      await t.mutation(api.agentAuth.setAgentHostStatus, {
        hostId: host.id,
        organizationId: expirySeed.organizationId,
        status: "active",
        operatorUserId: expirySeed.ownerUserId,
      });
      const challenge = await createAgentAuthDeviceAuthorizationChallenge({
        now,
      });
      const agentKey = await publicJwk();
      const registration = await t.mutation(api.agentAuth.registerAgentWithDeviceAuthorization, {
        hostId: host.id,
        organizationId: expirySeed.organizationId,
        name: "Abandoned agent",
        mode: "autonomous",
        publicJwkJson: agentKey.json,
        permissions: [],
        requestedGrants: [],
        deviceAuthorization: {
          userCodeHash: challenge.userCodeHash,
          deviceCodeHash: challenge.deviceCodeHash,
          expiresAt: now + 5_000,
          pollIntervalSeconds: 5,
        },
      });
      vi.setSystemTime(now + 5_001);
      assert.deepEqual(
        await t.mutation(api.agentAuth.pollAgentDeviceAuthorization, {
          deviceCodeHash: challenge.deviceCodeHash,
        }),
        { status: "expired_token" },
      );
      assert.equal(
        await t.run(async (ctx) => {
          const agentId = ctx.db.normalizeId("agents", registration.agentId)!;
          return (await ctx.db.get("agents", agentId))?.status;
        }),
        "rejected",
      );

      const denialSeed = await seedAuthority(t);
      const denialHostKey = await publicJwk();
      const denialHost = await t.mutation(api.agentAuth.registerAgentHost, {
        organizationId: denialSeed.organizationId,
        name: "Denial host",
        publicJwkJson: denialHostKey.json,
        createdBy: denialSeed.ownerUserId,
      });
      await t.mutation(api.agentAuth.setAgentHostStatus, {
        hostId: denialHost.id,
        organizationId: denialSeed.organizationId,
        status: "active",
        operatorUserId: denialSeed.ownerUserId,
      });
      const denialChallenge = await createAgentAuthDeviceAuthorizationChallenge({
        now: now + 5_001,
      });
      const denialAgentKey = await publicJwk();
      await t.mutation(api.agentAuth.registerAgentWithDeviceAuthorization, {
        hostId: denialHost.id,
        organizationId: denialSeed.organizationId,
        name: "Denied agent",
        mode: "delegated",
        delegatedUserId: denialSeed.ownerUserId,
        publicJwkJson: denialAgentKey.json,
        permissions: [],
        requestedGrants: [],
        deviceAuthorization: {
          userCodeHash: denialChallenge.userCodeHash,
          deviceCodeHash: denialChallenge.deviceCodeHash,
          expiresAt: denialChallenge.expiresAt,
          pollIntervalSeconds: denialChallenge.interval,
        },
      });
      assert.deepEqual(
        await t.mutation(api.agentAuth.decideAgentDeviceAuthorization, {
          organizationId: denialSeed.organizationId,
          operatorUserId: denialSeed.ownerUserId,
          userCodeHash: denialChallenge.userCodeHash,
          decision: "denied",
        }),
        { ok: true, status: "denied" },
      );
      assert.deepEqual(
        await t.mutation(api.agentAuth.pollAgentDeviceAuthorization, {
          deviceCodeHash: denialChallenge.deviceCodeHash,
        }),
        { status: "access_denied" },
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("admits exactly one concurrent human approval decision", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedAuthority(t);
    const hostKey = await publicJwk();
    const host = await t.mutation(api.agentAuth.registerAgentHost, {
      organizationId: seed.organizationId,
      name: "Contended approval host",
      publicJwkJson: hostKey.json,
      createdBy: seed.ownerUserId,
    });
    await t.mutation(api.agentAuth.setAgentHostStatus, {
      hostId: host.id,
      organizationId: seed.organizationId,
      status: "active",
      operatorUserId: seed.ownerUserId,
    });
    const challenge = await createAgentAuthDeviceAuthorizationChallenge();
    const agentKey = await publicJwk();
    await t.mutation(api.agentAuth.registerAgentWithDeviceAuthorization, {
      hostId: host.id,
      organizationId: seed.organizationId,
      name: "Contended approval agent",
      mode: "delegated",
      delegatedUserId: seed.ownerUserId,
      publicJwkJson: agentKey.json,
      permissions: [],
      requestedGrants: [],
      deviceAuthorization: {
        userCodeHash: challenge.userCodeHash,
        deviceCodeHash: challenge.deviceCodeHash,
        expiresAt: challenge.expiresAt,
        pollIntervalSeconds: challenge.interval,
      },
    });

    const decisions = await Promise.all(
      Array.from(
        { length: 64 },
        async () =>
          await t.mutation(api.agentAuth.decideAgentDeviceAuthorization, {
            organizationId: seed.organizationId,
            operatorUserId: seed.ownerUserId,
            userCodeHash: challenge.userCodeHash,
            decision: "approved",
          }),
      ),
    );
    assert.equal(
      decisions.filter((decision) => decision.ok).length,
      1,
      "only one transaction may promote the pending agent",
    );
    assert.equal(decisions.filter((decision) => !decision.ok).length, 63);
  });

  it("lets a protocol host manage only itself and its own child agents", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const seed = await seedAuthority(t);
    const firstHostKey = await publicJwk();
    const secondHostKey = await publicJwk();
    const firstHost = await t.mutation(api.agentAuth.registerAgentHost, {
      organizationId: seed.organizationId,
      name: "First host",
      publicJwkJson: firstHostKey.json,
      createdBy: seed.ownerUserId,
    });
    const secondHost = await t.mutation(api.agentAuth.registerAgentHost, {
      organizationId: seed.organizationId,
      name: "Second host",
      publicJwkJson: secondHostKey.json,
      createdBy: seed.ownerUserId,
    });
    for (const hostId of [firstHost.id, secondHost.id]) {
      await t.mutation(api.agentAuth.setAgentHostStatus, {
        hostId,
        organizationId: seed.organizationId,
        status: "active",
        operatorUserId: seed.ownerUserId,
      });
    }
    const agentKey = await publicJwk();
    const agent = await t.mutation(api.agentAuth.registerAgent, {
      hostId: firstHost.id,
      organizationId: seed.organizationId,
      name: "First child",
      mode: "delegated",
      delegatedUserId: seed.ownerUserId,
      publicJwkJson: agentKey.json,
      permissions: [],
      requestedGrants: [],
    });
    await t.mutation(api.agentAuth.setAgentStatus, {
      agentId: agent.id,
      organizationId: seed.organizationId,
      status: "active",
      operatorUserId: seed.ownerUserId,
    });

    await assert.rejects(
      t.mutation(api.agentAuth.revokeAgentAsHost, {
        hostId: secondHost.id,
        agentId: agent.id,
        organizationId: seed.organizationId,
      }),
      /not owned by the authenticated host/,
    );
    const rotatedKey = await publicJwk();
    assert.equal(
      (
        await t.mutation(api.agentAuth.rotateAgentKeyAsHost, {
          hostId: firstHost.id,
          agentId: agent.id,
          organizationId: seed.organizationId,
          expectedGeneration: 1,
          publicJwkJson: rotatedKey.json,
        })
      ).generation,
      2,
    );
    await t.mutation(api.agentAuth.setAgentStatus, {
      agentId: agent.id,
      organizationId: seed.organizationId,
      status: "expired",
      operatorUserId: seed.ownerUserId,
    });
    assert.deepEqual(
      await t.mutation(api.agentAuth.reactivateAgentAsHost, {
        hostId: firstHost.id,
        agentId: agent.id,
        organizationId: seed.organizationId,
        expiresAt: Date.now() + 60_000,
      }),
      { status: "active" },
    );
    assert.deepEqual(
      await t.mutation(api.agentAuth.revokeAgentAsHost, {
        hostId: firstHost.id,
        agentId: agent.id,
        organizationId: seed.organizationId,
      }),
      { ok: true },
    );
    assert.equal(
      await t.query(api.agentAuth.getAgentProtocolVerificationMaterial, {
        agentId: agent.id,
        hostThumbprint: firstHostKey.thumbprint,
      }),
      null,
    );
    assert.deepEqual(
      await t.mutation(api.agentAuth.revokeAgentHostAsHost, {
        hostId: firstHost.id,
        organizationId: seed.organizationId,
      }),
      { ok: true },
    );
    assert.equal(
      await t.query(api.agentAuth.getAgentHostProtocolVerificationMaterial, {
        thumbprint: firstHostKey.thumbprint,
      }),
      null,
    );
  });
});

async function publicJwk() {
  const { publicKey } = await generateKeyPair("EdDSA");
  const jwk = await exportJWK(publicKey);
  return {
    json: JSON.stringify(jwk),
    thumbprint: await calculateJwkThumbprint(jwk),
  };
}

async function credentialKey() {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA");
  const jwk = await exportJWK(publicKey);
  return {
    json: JSON.stringify(jwk),
    privateKey,
    thumbprint: await calculateJwkThumbprint(jwk),
  };
}

async function seedAuthority(t: ReturnType<typeof convexTest>) {
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
      permissions: ["agents:invoke"],
      isSystem: true,
      createdBy: ownerUserId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("organization_members", {
      organizationId,
      userId: ownerUserId,
      roleId,
      status: "active",
      assignedBy: ownerUserId,
      createdAt: now,
      updatedAt: now,
    });
    return { organizationId, ownerRoleId: roleId, ownerUserId };
  });
}
