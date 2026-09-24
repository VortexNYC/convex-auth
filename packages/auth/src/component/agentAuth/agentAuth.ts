import { intersectPermissions } from "../../compat/permissions";
import { v } from "convex/values";
import { getPage } from "convex-helpers/server/pagination";
import { getOneFrom } from "convex-helpers/server/relationships";

import { base64urlToBytes, bytesToBase64url } from "../../convex-runtime/native/password.js";
import { internal } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { internalMutation, mutation, query } from "./_generated/server.js";
import {
  agentCapabilityGrantStatusValidator,
  agentDeviceAuthorizationStatusValidator,
  agentHostStatusValidator,
  agentKeyStatusValidator,
  agentModeValidator,
  agentStatusValidator,
} from "../schema/validators.js";
import schema from "./schema.js";

const MAX_AGENT_GRANTS = 64;
const MAX_AGENT_PERMISSIONS = 64;
const MAX_CREDENTIAL_REPLAY_LIFETIME_MS = 120_000;
const MAX_REPLAY_CLEANUP_BATCH = 100;
const MAX_DEVICE_AUTHORIZATION_LIFETIME_MS = 15 * 60_000;
const MIN_DEVICE_AUTHORIZATION_POLL_INTERVAL_SECONDS = 5;
const MAX_DEVICE_AUTHORIZATION_POLL_INTERVAL_SECONDS = 60;
const HOST_REVOCATION_BATCH_SIZE = 4;
const MAX_CAPABILITY_CONSTRAINTS_JSON_LENGTH = 16_000;
const DEVICE_AUTHORIZATION_SLOW_DOWN_SECONDS = 5;
const DEVICE_AUTHORIZATION_ATTEMPT_LIMIT = 5;
const DEVICE_AUTHORIZATION_ATTEMPT_WINDOW_MS = 5 * 60_000;
const DEVICE_AUTHORIZATION_BLOCK_MS = 15 * 60_000;
const okValidator = v.object({ ok: v.literal(true) });
const idResultValidator = v.object({ id: v.string() });

const grantInputValidator = v.object({
  capability: v.string(),
  constraintsJson: v.optional(v.string()),
  expiresAt: v.optional(v.number()),
});

const grantSnapshotValidator = v.object({
  capability: v.string(),
  constraintsJson: v.optional(v.string()),
  expiresAt: v.optional(v.number()),
});

const agentPrincipalValidator = v.object({
  kind: v.literal("agent"),
  agentId: v.string(),
  hostId: v.string(),
  organizationId: v.string(),
  mode: agentModeValidator,
  delegatedUserId: v.union(v.string(), v.null()),
  credentialId: v.string(),
  permissions: v.array(v.string()),
  capabilityGrants: v.array(grantSnapshotValidator),
  isRestricted: v.boolean(),
  restrictedReason: v.union(v.string(), v.null()),
});

const verificationMaterialValidator = v.object({
  agentId: v.id("agents"),
  hostId: v.id("agent_hosts"),
  organizationId: v.id("organizations"),
  generation: v.number(),
  thumbprint: v.string(),
  publicJwkJson: v.string(),
});

const protocolVerificationMaterialValidator = v.object({
  agentId: v.id("agents"),
  hostId: v.id("agent_hosts"),
  organizationId: v.id("organizations"),
  agentKeyGeneration: v.number(),
  agentPublicJwkJson: v.string(),
  hostKeyGeneration: v.number(),
  hostThumbprint: v.string(),
});

const hostProtocolVerificationMaterialValidator = v.object({
  hostId: v.id("agent_hosts"),
  organizationId: v.id("organizations"),
  generation: v.number(),
  thumbprint: v.string(),
  publicJwkJson: v.string(),
});

const agentAuthorityIntrospectionValidator = v.union(
  v.object({ active: v.literal(false) }),
  v.object({
    active: v.literal(true),
    agentId: v.id("agents"),
    hostId: v.id("agent_hosts"),
    organizationId: v.id("organizations"),
    mode: agentModeValidator,
    delegatedUserId: v.union(v.id("users"), v.null()),
    expiresAt: v.optional(v.number()),
    absoluteExpiresAt: v.optional(v.number()),
    permissions: v.array(v.string()),
    capabilityGrants: v.array(grantSnapshotValidator),
  }),
);

const agentHostAuthorityStatusValidator = v.union(
  v.null(),
  v.object({
    hostId: v.id("agent_hosts"),
    organizationId: v.id("organizations"),
    status: agentHostStatusValidator,
    activeKeyGeneration: v.number(),
    cascadeCompletedAt: v.optional(v.number()),
  }),
);

const agentAuthorityStatusValidator = v.union(
  v.null(),
  v.object({
    agentId: v.id("agents"),
    hostId: v.id("agent_hosts"),
    organizationId: v.id("organizations"),
    mode: agentModeValidator,
    status: agentStatusValidator,
    activeKeyGeneration: v.number(),
    expiresAt: v.optional(v.number()),
    absoluteExpiresAt: v.optional(v.number()),
  }),
);

const deviceAuthorizationInputValidator = v.object({
  userCodeHash: v.string(),
  deviceCodeHash: v.string(),
  expiresAt: v.number(),
  pollIntervalSeconds: v.number(),
});

const deviceAuthorizationRegistrationResultValidator = v.object({
  agentId: v.string(),
  authorizationId: v.string(),
});

const deviceAuthorizationDecisionResultValidator = v.union(
  v.object({
    ok: v.literal(true),
    status: v.union(v.literal("approved"), v.literal("denied")),
  }),
  v.object({
    ok: v.literal(false),
    reason: v.union(v.literal("invalid_code"), v.literal("rate_limited")),
    retryAt: v.optional(v.number()),
  }),
);

const deviceAuthorizationPollResultValidator = v.union(
  v.object({
    status: v.literal("authorization_pending"),
    interval: v.number(),
  }),
  v.object({
    status: v.literal("slow_down"),
    interval: v.number(),
  }),
  v.object({ status: v.literal("expired_token") }),
  v.object({ status: v.literal("access_denied") }),
  v.object({
    status: v.literal("approved"),
    agentId: v.string(),
  }),
);

const agentReactivationResultValidator = v.object({
  status: v.union(v.literal("active"), v.literal("revoked")),
});

type DbCtx = Pick<MutationCtx | QueryCtx, "db">;
type RegisterAgentArgs = {
  hostId: Id<"agent_hosts">;
  organizationId: Id<"organizations">;
  name: string;
  mode: "delegated" | "autonomous";
  delegatedUserId?: Id<"users">;
  publicJwkJson: string;
  permissions: string[];
  requestedGrants: Array<{
    capability: string;
    constraintsJson?: string;
    expiresAt?: number;
  }>;
};

export const registerAgentHost = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    publicJwkJson: v.string(),
    createdBy: v.id("users"),
  },
  returns: idResultValidator,
  handler: async (ctx, args) => {
    await requireActiveOperator(ctx, args.organizationId, args.createdBy);
    const publicKey = await normalizePublicEd25519Jwk(args.publicJwkJson);
    await requireUnusedThumbprint(ctx, publicKey.thumbprint);
    const now = Date.now();
    const hostId = await ctx.db.insert("agent_hosts", {
      organizationId: args.organizationId,
      name: requireText(args.name, "name"),
      status: "pending",
      activeKeyGeneration: 1,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("agent_host_keys", {
      hostId,
      generation: 1,
      thumbprint: publicKey.thumbprint,
      publicJwkJson: publicKey.json,
      status: "active",
      createdAt: now,
    });
    await audit(ctx, {
      organizationId: args.organizationId,
      hostId,
      actorUserId: args.createdBy,
      eventType: "agent_host.registered",
    });
    return { id: hostId };
  },
});

export const setAgentHostStatus = mutation({
  args: {
    hostId: v.id("agent_hosts"),
    organizationId: v.id("organizations"),
    status: agentHostStatusValidator,
    operatorUserId: v.id("users"),
  },
  returns: okValidator,
  handler: async (ctx, args) => {
    const host = await requireHostInOrganization(ctx, args.hostId, args.organizationId);
    await requireActiveOperator(ctx, args.organizationId, args.operatorUserId);
    if (host.status === "revoked" || host.status === "rejected") {
      throw new Error("Terminal agent host cannot transition");
    }
    if (args.status === "pending") {
      throw new Error("Agent host cannot transition back to pending");
    }
    requireHostStatusTransition(host.status, args.status);
    const now = Date.now();
    await ctx.db.patch("agent_hosts", host._id, {
      status: args.status,
      activatedBy: args.status === "active" ? args.operatorUserId : host.activatedBy,
      activatedAt: args.status === "active" ? now : host.activatedAt,
      revokedBy:
        args.status === "revoked" || args.status === "rejected"
          ? args.operatorUserId
          : host.revokedBy,
      revokedAt: args.status === "revoked" || args.status === "rejected" ? now : host.revokedAt,
      cascadeCompletedAt: args.status === "revoked" ? undefined : host.cascadeCompletedAt,
      updatedAt: now,
    });
    if (args.status === "revoked") {
      const activeKey = await requireHostKey(ctx, host._id, host.activeKeyGeneration);
      if (activeKey.status === "active") {
        await ctx.db.patch("agent_host_keys", activeKey._id, {
          status: "revoked",
          retiredAt: now,
        });
      }
      await ctx.scheduler.runAfter(0, internal.agentAuth.cascadeRevokedAgentHost, {
        hostId: host._id,
        phase: "pending",
      });
    }
    await audit(ctx, {
      organizationId: args.organizationId,
      hostId: host._id,
      actorUserId: args.operatorUserId,
      eventType: `agent_host.${args.status}`,
    });
    return { ok: true } as const;
  },
});

export const revokeAgentHostAsHost = mutation({
  args: {
    hostId: v.id("agent_hosts"),
    organizationId: v.id("organizations"),
  },
  returns: okValidator,
  handler: async (ctx, args) => {
    const host = await requireHostInOrganization(ctx, args.hostId, args.organizationId);
    if (host.status === "revoked") return { ok: true } as const;
    if (host.status !== "active") {
      throw new Error("Only an active agent host can revoke itself");
    }
    const now = Date.now();
    const activeKey = await requireHostKey(ctx, host._id, host.activeKeyGeneration);
    await ctx.db.patch("agent_hosts", host._id, {
      status: "revoked",
      revokedAt: now,
      cascadeCompletedAt: undefined,
      updatedAt: now,
    });
    if (activeKey.status === "active") {
      await ctx.db.patch("agent_host_keys", activeKey._id, {
        status: "revoked",
        retiredAt: now,
      });
    }
    await ctx.scheduler.runAfter(0, internal.agentAuth.cascadeRevokedAgentHost, {
      hostId: host._id,
      phase: "pending",
    });
    await audit(ctx, {
      organizationId: host.organizationId,
      hostId: host._id,
      actorType: "host",
      eventType: "agent_host.revoked",
    });
    return { ok: true } as const;
  },
});

export const registerAgent = mutation({
  args: {
    hostId: v.id("agent_hosts"),
    organizationId: v.id("organizations"),
    name: v.string(),
    mode: agentModeValidator,
    delegatedUserId: v.optional(v.id("users")),
    publicJwkJson: v.string(),
    permissions: v.array(v.string()),
    requestedGrants: v.array(grantInputValidator),
  },
  returns: idResultValidator,
  handler: async (ctx, args) => {
    const agentId = await insertPendingAgent(ctx, args);
    return { id: agentId };
  },
});

export const registerAgentWithDeviceAuthorization = mutation({
  args: {
    hostId: v.id("agent_hosts"),
    organizationId: v.id("organizations"),
    name: v.string(),
    mode: agentModeValidator,
    delegatedUserId: v.optional(v.id("users")),
    publicJwkJson: v.string(),
    permissions: v.array(v.string()),
    requestedGrants: v.array(grantInputValidator),
    deviceAuthorization: deviceAuthorizationInputValidator,
  },
  returns: deviceAuthorizationRegistrationResultValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    requireDeviceAuthorizationPolicy(args.deviceAuthorization, now);
    await requireUnusedDeviceAuthorizationCodes(
      ctx,
      args.deviceAuthorization.userCodeHash,
      args.deviceAuthorization.deviceCodeHash,
    );
    const agentId = await insertPendingAgent(ctx, args);
    const authorizationId = await ctx.db.insert("agent_device_authorizations", {
      organizationId: args.organizationId,
      hostId: args.hostId,
      agentId,
      status: "pending",
      userCodeHash: requireHash(args.deviceAuthorization.userCodeHash, "userCodeHash"),
      deviceCodeHash: requireHash(args.deviceAuthorization.deviceCodeHash, "deviceCodeHash"),
      pollCount: 0,
      pollIntervalSeconds: args.deviceAuthorization.pollIntervalSeconds,
      nextPollAt: now + args.deviceAuthorization.pollIntervalSeconds * 1000,
      expiresAt: args.deviceAuthorization.expiresAt,
      createdAt: now,
      updatedAt: now,
    });
    await audit(ctx, {
      organizationId: args.organizationId,
      hostId: args.hostId,
      agentId,
      actorType: "host",
      eventType: "agent.device_authorization.created",
    });
    return { agentId, authorizationId };
  },
});

export const decideAgentDeviceAuthorization = mutation({
  args: {
    organizationId: v.id("organizations"),
    operatorUserId: v.id("users"),
    userCodeHash: v.string(),
    decision: v.union(v.literal("approved"), v.literal("denied")),
  },
  returns: deviceAuthorizationDecisionResultValidator,
  handler: async (ctx, args) => {
    await requireActiveOperator(ctx, args.organizationId, args.operatorUserId);
    const now = Date.now();
    const rateLimit = await readDeviceAuthorizationAttemptLimit(ctx, args.operatorUserId, now);
    if (!rateLimit.allowed) {
      return {
        ok: false,
        reason: "rate_limited",
        retryAt: rateLimit.retryAt,
      } as const;
    }
    const authorization = await getOneFrom(
      ctx.db,
      "agent_device_authorizations",
      "by_user_code_hash",
      requireHash(args.userCodeHash, "userCodeHash"),
      "userCodeHash",
    );
    if (
      authorization === null ||
      authorization.organizationId !== args.organizationId ||
      authorization.status !== "pending"
    ) {
      await recordFailedDeviceAuthorizationAttempt(ctx, args.operatorUserId, rateLimit, now);
      return { ok: false, reason: "invalid_code" } as const;
    }
    const agent = await requireAgentInOrganization(ctx, authorization.agentId, args.organizationId);
    if (authorization.expiresAt <= now) {
      await expirePendingDeviceAuthorization(ctx, authorization, agent, now);
      await recordFailedDeviceAuthorizationAttempt(ctx, args.operatorUserId, rateLimit, now);
      return { ok: false, reason: "invalid_code" } as const;
    }
    requireAgentStatusTransition(
      agent.status,
      args.decision === "approved" ? "active" : "rejected",
    );
    await ctx.db.patch("agent_device_authorizations", authorization._id, {
      status: args.decision,
      ...(args.decision === "approved"
        ? { approvedBy: args.operatorUserId, approvedAt: now }
        : { deniedBy: args.operatorUserId, deniedAt: now }),
      updatedAt: now,
    });
    await ctx.db.patch("agents", agent._id, {
      status: args.decision === "approved" ? "active" : "rejected",
      ...(args.decision === "approved"
        ? { activatedBy: args.operatorUserId, activatedAt: now }
        : { revokedBy: args.operatorUserId, revokedAt: now }),
      updatedAt: now,
    });
    await clearDeviceAuthorizationAttempts(ctx, args.operatorUserId);
    await audit(ctx, {
      organizationId: args.organizationId,
      hostId: authorization.hostId,
      agentId: authorization.agentId,
      actorUserId: args.operatorUserId,
      eventType: `agent.device_authorization.${args.decision}`,
    });
    return { ok: true, status: args.decision } as const;
  },
});

export const pollAgentDeviceAuthorization = mutation({
  args: { deviceCodeHash: v.string() },
  returns: deviceAuthorizationPollResultValidator,
  handler: async (ctx, args) => {
    const authorization = await getOneFrom(
      ctx.db,
      "agent_device_authorizations",
      "by_device_code_hash",
      requireHash(args.deviceCodeHash, "deviceCodeHash"),
      "deviceCodeHash",
    );
    if (authorization === null) {
      throw new Error("Device authorization grant is invalid");
    }
    const now = Date.now();
    const agent = await ctx.db.get("agents", authorization.agentId);
    if (agent === null) throw new Error("Device authorization agent not found");
    if (authorization.expiresAt <= now || authorization.status === "expired") {
      if (authorization.status === "pending") {
        await expirePendingDeviceAuthorization(ctx, authorization, agent, now);
      }
      return { status: "expired_token" } as const;
    }
    if (authorization.status === "denied") {
      return { status: "access_denied" } as const;
    }
    if (authorization.status === "approved") {
      if (authorization.consumedAt !== undefined) {
        throw new Error("Device authorization grant was already consumed");
      }
      await ctx.db.patch("agent_device_authorizations", authorization._id, {
        consumedAt: now,
        updatedAt: now,
      });
      return { status: "approved", agentId: authorization.agentId } as const;
    }
    if (now < authorization.nextPollAt) {
      const interval = Math.min(
        authorization.pollIntervalSeconds + DEVICE_AUTHORIZATION_SLOW_DOWN_SECONDS,
        MAX_DEVICE_AUTHORIZATION_POLL_INTERVAL_SECONDS,
      );
      await ctx.db.patch("agent_device_authorizations", authorization._id, {
        pollCount: authorization.pollCount + 1,
        pollIntervalSeconds: interval,
        nextPollAt: now + interval * 1000,
        updatedAt: now,
      });
      return { status: "slow_down", interval } as const;
    }
    await ctx.db.patch("agent_device_authorizations", authorization._id, {
      pollCount: authorization.pollCount + 1,
      nextPollAt: now + authorization.pollIntervalSeconds * 1000,
      updatedAt: now,
    });
    return {
      status: "authorization_pending",
      interval: authorization.pollIntervalSeconds,
    } as const;
  },
});

export const rotateAgentHostKey = mutation({
  args: {
    hostId: v.id("agent_hosts"),
    organizationId: v.id("organizations"),
    expectedGeneration: v.number(),
    publicJwkJson: v.string(),
    operatorUserId: v.id("users"),
  },
  returns: v.object({ generation: v.number(), thumbprint: v.string() }),
  handler: async (ctx, args) => {
    const host = await requireHostInOrganization(ctx, args.hostId, args.organizationId);
    await requireActiveOperator(ctx, args.organizationId, args.operatorUserId);
    return await rotateHostKey(ctx, host, {
      expectedGeneration: args.expectedGeneration,
      publicJwkJson: args.publicJwkJson,
      actorUserId: args.operatorUserId,
    });
  },
});

export const rotateAgentHostKeyAsHost = mutation({
  args: {
    hostId: v.id("agent_hosts"),
    organizationId: v.id("organizations"),
    expectedGeneration: v.number(),
    publicJwkJson: v.string(),
  },
  returns: v.object({ generation: v.number(), thumbprint: v.string() }),
  handler: async (ctx, args) => {
    const host = await requireHostInOrganization(ctx, args.hostId, args.organizationId);
    return await rotateHostKey(ctx, host, {
      expectedGeneration: args.expectedGeneration,
      publicJwkJson: args.publicJwkJson,
      actorType: "host",
    });
  },
});

export const setAgentStatus = mutation({
  args: {
    agentId: v.id("agents"),
    organizationId: v.id("organizations"),
    status: agentStatusValidator,
    operatorUserId: v.id("users"),
    expiresAt: v.optional(v.number()),
    absoluteExpiresAt: v.optional(v.number()),
  },
  returns: okValidator,
  handler: async (ctx, args) => {
    const agent = await requireAgentInOrganization(ctx, args.agentId, args.organizationId);
    await requireActiveOperator(ctx, args.organizationId, args.operatorUserId);
    if (agent.status === "revoked" || agent.status === "rejected") {
      throw new Error("Terminal agent cannot transition");
    }
    if (args.status === "pending") {
      throw new Error("Agent cannot transition back to pending");
    }
    requireAgentStatusTransition(agent.status, args.status);
    const now = Date.now();
    const expiresAt = args.expiresAt ?? agent.expiresAt;
    const absoluteExpiresAt = args.absoluteExpiresAt ?? agent.absoluteExpiresAt;
    if (
      agent.absoluteExpiresAt !== undefined &&
      args.absoluteExpiresAt !== undefined &&
      args.absoluteExpiresAt > agent.absoluteExpiresAt
    ) {
      throw new Error("Agent absolute expiry cannot be extended");
    }
    requireOptionalTimestamp(expiresAt, "expiresAt");
    requireOptionalTimestamp(absoluteExpiresAt, "absoluteExpiresAt");
    if (
      expiresAt !== undefined &&
      absoluteExpiresAt !== undefined &&
      expiresAt > absoluteExpiresAt
    ) {
      throw new Error("Agent expiry cannot exceed absolute expiry");
    }
    if (args.status === "active") {
      const host = await requireHostInOrganization(ctx, agent.hostId, args.organizationId);
      if (host.status !== "active") throw new Error("Agent host is not active");
      await requireStoredModeOwner(ctx, agent);
      if (
        (expiresAt !== undefined && expiresAt <= now) ||
        (absoluteExpiresAt !== undefined && absoluteExpiresAt <= now)
      ) {
        throw new Error("Expired agent cannot become active");
      }
    }
    if (args.status === "revoked") {
      await revokeAgentDependents(ctx, agent, {
        now,
        reason: "Agent authority revoked",
      });
    }
    await ctx.db.patch("agents", agent._id, {
      status: args.status,
      activatedBy: args.status === "active" ? args.operatorUserId : agent.activatedBy,
      activatedAt: args.status === "active" ? now : agent.activatedAt,
      expiresAt,
      absoluteExpiresAt,
      revokedBy:
        args.status === "revoked" || args.status === "rejected"
          ? args.operatorUserId
          : agent.revokedBy,
      revokedAt: args.status === "revoked" || args.status === "rejected" ? now : agent.revokedAt,
      updatedAt: now,
    });
    await audit(ctx, {
      organizationId: args.organizationId,
      hostId: agent.hostId,
      agentId: agent._id,
      actorUserId: args.operatorUserId,
      eventType: `agent.${args.status}`,
    });
    return { ok: true } as const;
  },
});

export const revokeAgentAsHost = mutation({
  args: {
    hostId: v.id("agent_hosts"),
    agentId: v.id("agents"),
    organizationId: v.id("organizations"),
  },
  returns: okValidator,
  handler: async (ctx, args) => {
    const agent = await requireHostOwnedAgent(ctx, args);
    if (agent.status === "revoked") return { ok: true } as const;
    if (agent.status === "rejected") {
      throw new Error("Rejected agent is already terminal");
    }
    const now = Date.now();
    await revokeAgentDependents(ctx, agent, {
      now,
      reason: "Agent authority revoked by host",
    });
    await ctx.db.patch("agents", agent._id, {
      status: "revoked",
      revokedAt: now,
      updatedAt: now,
    });
    await audit(ctx, {
      organizationId: agent.organizationId,
      hostId: agent.hostId,
      agentId: agent._id,
      actorType: "host",
      eventType: "agent.revoked",
    });
    return { ok: true } as const;
  },
});

export const reactivateAgent = mutation({
  args: {
    agentId: v.id("agents"),
    organizationId: v.id("organizations"),
    operatorUserId: v.id("users"),
    expiresAt: v.number(),
  },
  returns: agentReactivationResultValidator,
  handler: async (ctx, args) => {
    const agent = await requireAgentInOrganization(ctx, args.agentId, args.organizationId);
    await requireActiveOperator(ctx, args.organizationId, args.operatorUserId);
    return await reactivateStoredAgent(ctx, agent, {
      expiresAt: args.expiresAt,
      actorUserId: args.operatorUserId,
    });
  },
});

export const reactivateAgentAsHost = mutation({
  args: {
    hostId: v.id("agent_hosts"),
    agentId: v.id("agents"),
    organizationId: v.id("organizations"),
    expiresAt: v.number(),
  },
  returns: agentReactivationResultValidator,
  handler: async (ctx, args) => {
    const agent = await requireHostOwnedAgent(ctx, args);
    return await reactivateStoredAgent(ctx, agent, {
      expiresAt: args.expiresAt,
      actorType: "host",
    });
  },
});

export const rotateAgentKey = mutation({
  args: {
    agentId: v.id("agents"),
    organizationId: v.id("organizations"),
    expectedGeneration: v.number(),
    publicJwkJson: v.string(),
    operatorUserId: v.id("users"),
  },
  returns: v.object({ generation: v.number(), thumbprint: v.string() }),
  handler: async (ctx, args) => {
    const agent = await requireAgentInOrganization(ctx, args.agentId, args.organizationId);
    await requireActiveOperator(ctx, args.organizationId, args.operatorUserId);
    return await rotateStoredAgentKey(ctx, agent, {
      expectedGeneration: args.expectedGeneration,
      publicJwkJson: args.publicJwkJson,
      actorUserId: args.operatorUserId,
    });
  },
});

export const rotateAgentKeyAsHost = mutation({
  args: {
    hostId: v.id("agent_hosts"),
    agentId: v.id("agents"),
    organizationId: v.id("organizations"),
    expectedGeneration: v.number(),
    publicJwkJson: v.string(),
  },
  returns: v.object({ generation: v.number(), thumbprint: v.string() }),
  handler: async (ctx, args) => {
    const agent = await requireHostOwnedAgent(ctx, args);
    return await rotateStoredAgentKey(ctx, agent, {
      expectedGeneration: args.expectedGeneration,
      publicJwkJson: args.publicJwkJson,
      actorType: "host",
    });
  },
});

export const rotateAgentKeyAsAgent = mutation({
  args: {
    agentId: v.id("agents"),
    organizationId: v.id("organizations"),
    expectedGeneration: v.number(),
    publicJwkJson: v.string(),
  },
  returns: v.object({ generation: v.number(), thumbprint: v.string() }),
  handler: async (ctx, args) => {
    const agent = await requireAgentInOrganization(ctx, args.agentId, args.organizationId);
    return await rotateStoredAgentKey(ctx, agent, {
      expectedGeneration: args.expectedGeneration,
      publicJwkJson: args.publicJwkJson,
      actorType: "agent",
    });
  },
});

export const setAgentCapabilityGrantStatus = mutation({
  args: {
    agentId: v.id("agents"),
    organizationId: v.id("organizations"),
    capability: v.string(),
    status: agentCapabilityGrantStatusValidator,
    operatorUserId: v.id("users"),
    reason: v.optional(v.string()),
  },
  returns: okValidator,
  handler: async (ctx, args) => {
    const agent = await requireAgentInOrganization(ctx, args.agentId, args.organizationId);
    await requireActiveOperator(ctx, args.organizationId, args.operatorUserId);
    const capability = requireText(args.capability, "capability");
    const grant = await findAgentCapabilityGrant(ctx, agent._id, capability);
    if (grant === null) throw new Error("Agent capability grant not found");
    if (args.status === "pending") {
      throw new Error("Agent capability grant cannot transition back to pending");
    }
    requireCapabilityStatusTransition(grant.status, args.status);
    const now = Date.now();
    await ctx.db.patch("agent_capability_grants", grant._id, {
      status: args.status,
      grantedBy: args.status === "active" ? args.operatorUserId : grant.grantedBy,
      deniedBy: args.status === "denied" ? args.operatorUserId : grant.deniedBy,
      reason: args.reason === undefined ? grant.reason : requireText(args.reason, "reason"),
      updatedAt: now,
    });
    await audit(ctx, {
      organizationId: args.organizationId,
      hostId: agent.hostId,
      agentId: agent._id,
      actorUserId: args.operatorUserId,
      eventType: `agent_capability.${args.status}`,
    });
    return { ok: true } as const;
  },
});

export const getAgentVerificationMaterial = query({
  args: { thumbprint: v.string() },
  returns: v.union(v.null(), verificationMaterialValidator),
  handler: async (ctx, args) => {
    const key = await getOneFrom(
      ctx.db,
      "agent_keys",
      "by_thumbprint",
      requireText(args.thumbprint, "thumbprint"),
      "thumbprint",
    );
    if (key === null) return null;
    const agent = await ctx.db.get("agents", key.agentId);
    if (agent === null) return null;
    return {
      agentId: agent._id,
      hostId: agent.hostId,
      organizationId: agent.organizationId,
      generation: key.generation,
      thumbprint: key.thumbprint,
      publicJwkJson: key.publicJwkJson,
    };
  },
});

export const getAgentProtocolVerificationMaterial = query({
  args: {
    agentId: v.id("agents"),
    hostThumbprint: v.string(),
  },
  returns: v.union(v.null(), protocolVerificationMaterialValidator),
  handler: async (ctx, args) => {
    const now = Date.now();
    const agent = await ctx.db.get("agents", args.agentId);
    if (
      agent === null ||
      agent.status !== "active" ||
      (agent.expiresAt !== undefined && agent.expiresAt <= now) ||
      (agent.absoluteExpiresAt !== undefined && agent.absoluteExpiresAt <= now)
    ) {
      return null;
    }
    const host = await ctx.db.get("agent_hosts", agent.hostId);
    if (host === null || host.status !== "active") return null;
    const [agentKey, hostKey] = await Promise.all([
      requireAgentKey(ctx, agent._id, agent.activeKeyGeneration),
      requireHostKey(ctx, host._id, host.activeKeyGeneration),
    ]);
    if (
      agentKey.status !== "active" ||
      hostKey.status !== "active" ||
      hostKey.thumbprint !== requireText(args.hostThumbprint, "hostThumbprint")
    ) {
      return null;
    }
    return {
      agentId: agent._id,
      hostId: host._id,
      organizationId: agent.organizationId,
      agentKeyGeneration: agentKey.generation,
      agentPublicJwkJson: agentKey.publicJwkJson,
      hostKeyGeneration: hostKey.generation,
      hostThumbprint: hostKey.thumbprint,
    };
  },
});

export const getAgentHostProtocolVerificationMaterial = query({
  args: { thumbprint: v.string() },
  returns: v.union(v.null(), hostProtocolVerificationMaterialValidator),
  handler: async (ctx, args) => {
    const key = await getOneFrom(
      ctx.db,
      "agent_host_keys",
      "by_thumbprint",
      requireText(args.thumbprint, "thumbprint"),
      "thumbprint",
    );
    if (key === null || key.status !== "active") return null;
    const host = await ctx.db.get("agent_hosts", key.hostId);
    if (host === null || host.status !== "active" || host.activeKeyGeneration !== key.generation) {
      return null;
    }
    return {
      hostId: host._id,
      organizationId: host.organizationId,
      generation: key.generation,
      thumbprint: key.thumbprint,
      publicJwkJson: key.publicJwkJson,
    };
  },
});

export const consumeAgentHostRequest = mutation({
  args: {
    hostId: v.id("agent_hosts"),
    keyGeneration: v.number(),
    replayIdHash: v.string(),
    replayExpiresAt: v.number(),
    requestedOrganizationId: v.optional(v.id("organizations")),
  },
  returns: v.object({
    hostId: v.id("agent_hosts"),
    organizationId: v.id("organizations"),
    keyGeneration: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    requireReplayLifetime(args.replayExpiresAt, now);
    const replayHash = requireText(args.replayIdHash, "replayIdHash");
    const replay = await getOneFrom(
      ctx.db,
      "agent_host_replay_records",
      "by_replay_hash",
      replayHash,
      "replayIdHash",
    );
    if (replay !== null) throw new Error("Agent host request replayed");
    const host = await ctx.db.get("agent_hosts", args.hostId);
    if (host === null || host.status !== "active") {
      throw new Error("Agent host is not active");
    }
    if (
      args.requestedOrganizationId !== undefined &&
      args.requestedOrganizationId !== host.organizationId
    ) {
      throw new Error("Agent host organization mismatch");
    }
    requireExpectedGeneration(args.keyGeneration, host.activeKeyGeneration, "Agent host");
    const key = await requireHostKey(ctx, host._id, args.keyGeneration);
    if (key.status !== "active") {
      throw new Error("Agent host key generation is not active");
    }
    await ctx.db.insert("agent_host_replay_records", {
      hostId: host._id,
      replayIdHash: replayHash,
      expiresAt: args.replayExpiresAt,
      createdAt: now,
    });
    await audit(ctx, {
      organizationId: host.organizationId,
      hostId: host._id,
      actorType: "host",
      eventType: "agent_host.request_consumed",
    });
    return {
      hostId: host._id,
      organizationId: host.organizationId,
      keyGeneration: key.generation,
    };
  },
});

export const getAgentHostAuthorityStatus = query({
  args: {
    hostId: v.id("agent_hosts"),
    organizationId: v.id("organizations"),
  },
  returns: agentHostAuthorityStatusValidator,
  handler: async (ctx, args) => {
    const host = await ctx.db.get("agent_hosts", args.hostId);
    if (host === null || host.organizationId !== args.organizationId) {
      return null;
    }
    return {
      hostId: host._id,
      organizationId: host.organizationId,
      status: host.status,
      activeKeyGeneration: host.activeKeyGeneration,
      cascadeCompletedAt: host.cascadeCompletedAt,
    };
  },
});

export const getAgentAuthorityStatus = query({
  args: {
    agentId: v.id("agents"),
    organizationId: v.id("organizations"),
  },
  returns: agentAuthorityStatusValidator,
  handler: async (ctx, args) => {
    const agent = await ctx.db.get("agents", args.agentId);
    if (agent === null || agent.organizationId !== args.organizationId) {
      return null;
    }
    const now = Date.now();
    const status =
      agent.status === "active" &&
      ((agent.expiresAt !== undefined && agent.expiresAt <= now) ||
        (agent.absoluteExpiresAt !== undefined && agent.absoluteExpiresAt <= now))
        ? "expired"
        : agent.status;
    return {
      agentId: agent._id,
      hostId: agent.hostId,
      organizationId: agent.organizationId,
      mode: agent.mode,
      status,
      activeKeyGeneration: agent.activeKeyGeneration,
      expiresAt: agent.expiresAt,
      absoluteExpiresAt: agent.absoluteExpiresAt,
    };
  },
});

export const introspectAgentAuthority = query({
  args: {
    agentId: v.id("agents"),
    organizationId: v.id("organizations"),
    claimedPermissions: v.optional(v.array(v.string())),
    claimedCapabilities: v.optional(v.array(v.string())),
  },
  returns: agentAuthorityIntrospectionValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const agent = await ctx.db.get("agents", args.agentId);
    if (
      agent === null ||
      agent.organizationId !== args.organizationId ||
      agent.status !== "active" ||
      (agent.expiresAt !== undefined && agent.expiresAt <= now) ||
      (agent.absoluteExpiresAt !== undefined && agent.absoluteExpiresAt <= now)
    ) {
      return { active: false } as const;
    }
    const [organization, host, key, delegatedOwner, grants] = await Promise.all([
      ctx.db.get("organizations", agent.organizationId),
      ctx.db.get("agent_hosts", agent.hostId),
      requireAgentKey(ctx, agent._id, agent.activeKeyGeneration),
      inspectStoredModeOwner(ctx, agent),
      readActiveAgentGrants(ctx, agent._id),
    ]);
    if (
      organization?.status !== "active" ||
      host?.status !== "active" ||
      host.organizationId !== agent.organizationId ||
      key.status !== "active" ||
      !delegatedOwner.active
    ) {
      return { active: false } as const;
    }
    const claimedCapabilities =
      args.claimedCapabilities === undefined
        ? null
        : new Set(normalizeStringSet(args.claimedCapabilities, "capability", MAX_AGENT_GRANTS));
    const capabilityGrants = grants
      .filter(
        (grant) =>
          (claimedCapabilities === null || claimedCapabilities.has(grant.capability)) &&
          (grant.expiresAt === undefined || grant.expiresAt > now),
      )
      .map(grantSnapshot);
    const claimedEffectivePermissions =
      args.claimedPermissions === undefined
        ? agent.permissions
        : intersectPermissions(
            agent.permissions,
            normalizeStringSet(args.claimedPermissions, "permission", MAX_AGENT_PERMISSIONS),
          );
    const permissions =
      delegatedOwner.permissions === null
        ? claimedEffectivePermissions
        : intersectPermissions(delegatedOwner.permissions, claimedEffectivePermissions);
    return {
      active: true,
      agentId: agent._id,
      hostId: agent.hostId,
      organizationId: agent.organizationId,
      mode: agent.mode,
      delegatedUserId: agent.delegatedUserId ?? null,
      expiresAt: agent.expiresAt,
      absoluteExpiresAt: agent.absoluteExpiresAt,
      permissions,
      capabilityGrants,
    } as const;
  },
});

export const consumeAgentCredential = mutation({
  args: {
    agentId: v.id("agents"),
    keyGeneration: v.number(),
    hostKeyGeneration: v.optional(v.number()),
    replayIdHash: v.string(),
    replayExpiresAt: v.number(),
    requestedOrganizationId: v.optional(v.id("organizations")),
    claimedPermissions: v.optional(v.array(v.string())),
    claimedCapabilities: v.optional(v.array(v.string())),
  },
  returns: agentPrincipalValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    requireReplayLifetime(args.replayExpiresAt, now);
    if (!Number.isSafeInteger(args.keyGeneration) || args.keyGeneration < 1) {
      throw new Error("Agent key generation is invalid");
    }
    if (
      args.hostKeyGeneration !== undefined &&
      (!Number.isSafeInteger(args.hostKeyGeneration) || args.hostKeyGeneration < 1)
    ) {
      throw new Error("Agent host key generation is invalid");
    }
    const replayHash = requireText(args.replayIdHash, "replayIdHash");
    const replay = await getOneFrom(
      ctx.db,
      "agent_replay_records",
      "by_replay_hash",
      replayHash,
      "replayIdHash",
    );
    if (replay !== null) throw new Error("Agent credential replayed");
    const agent = await ctx.db.get("agents", args.agentId);
    if (agent === null || agent.status !== "active") {
      throw new Error("Agent is not active");
    }
    if (
      args.requestedOrganizationId !== undefined &&
      args.requestedOrganizationId !== agent.organizationId
    ) {
      throw new Error("Agent organization mismatch");
    }
    const organization = await ctx.db.get("organizations", agent.organizationId);
    if (organization === null || organization.status !== "active") {
      throw new Error("Agent organization is not active");
    }
    const host = await ctx.db.get("agent_hosts", agent.hostId);
    if (host === null || host.status !== "active") {
      throw new Error("Agent host is not active");
    }
    if (host.organizationId !== agent.organizationId) {
      throw new Error("Agent host organization mismatch");
    }
    if (
      args.hostKeyGeneration !== undefined &&
      args.hostKeyGeneration !== host.activeKeyGeneration
    ) {
      throw new Error("Agent host key generation is not active");
    }
    if (
      (agent.expiresAt !== undefined && agent.expiresAt <= now) ||
      (agent.absoluteExpiresAt !== undefined && agent.absoluteExpiresAt <= now)
    ) {
      throw new Error("Agent authority expired");
    }
    const delegatedOwnerPermissions = await requireStoredModeOwner(ctx, agent);
    const key = await requireAgentKey(ctx, agent._id, args.keyGeneration);
    if (key.status !== "active" || args.keyGeneration !== agent.activeKeyGeneration) {
      throw new Error("Agent key generation is not active");
    }
    const grants = await readActiveAgentGrants(ctx, agent._id);
    const claimedCapabilities =
      args.claimedCapabilities === undefined
        ? null
        : new Set(normalizeStringSet(args.claimedCapabilities, "capability", MAX_AGENT_GRANTS));
    const capabilityGrants = grants
      .filter(
        (grant) =>
          (claimedCapabilities === null || claimedCapabilities.has(grant.capability)) &&
          (grant.expiresAt === undefined || grant.expiresAt > now),
      )
      .map(grantSnapshot);
    const claimedEffectivePermissions =
      args.claimedPermissions === undefined
        ? agent.permissions
        : intersectPermissions(
            agent.permissions,
            normalizeStringSet(args.claimedPermissions, "permission", MAX_AGENT_PERMISSIONS),
          );
    const permissions =
      delegatedOwnerPermissions === null
        ? claimedEffectivePermissions
        : intersectPermissions(delegatedOwnerPermissions, claimedEffectivePermissions);
    await ctx.db.insert("agent_replay_records", {
      agentId: agent._id,
      replayIdHash: replayHash,
      expiresAt: args.replayExpiresAt,
      createdAt: now,
    });
    await audit(ctx, {
      organizationId: agent.organizationId,
      hostId: host._id,
      agentId: agent._id,
      actorType: "agent",
      eventType: "agent.credential_consumed",
    });
    return {
      kind: "agent" as const,
      agentId: agent._id,
      hostId: host._id,
      organizationId: agent.organizationId,
      mode: agent.mode,
      delegatedUserId: agent.delegatedUserId ?? null,
      credentialId: `${agent._id}:${key.generation}`,
      permissions,
      capabilityGrants,
      isRestricted: false,
      restrictedReason: null,
    };
  },
});

export const cleanupExpiredAgentReplayRecords = mutation({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const limit = args.limit ?? MAX_REPLAY_CLEANUP_BATCH;
    requireReplayCleanupLimit(limit);
    const { page: expired } = await getPage(ctx, {
      table: "agent_replay_records",
      index: "by_expiry",
      endIndexKey: [now],
      endInclusive: true,
      absoluteMaxRows: limit,
      schema,
    });
    await Promise.all(
      expired.map(async (record) => {
        await ctx.db.delete("agent_replay_records", record._id);
      }),
    );
    return { deleted: expired.length };
  },
});

export const cleanupExpiredAgentHostReplayRecords = mutation({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const limit = args.limit ?? MAX_REPLAY_CLEANUP_BATCH;
    requireReplayCleanupLimit(limit);
    const { page: expired } = await getPage(ctx, {
      table: "agent_host_replay_records",
      index: "by_expiry",
      endIndexKey: [now],
      endInclusive: true,
      absoluteMaxRows: limit,
      schema,
    });
    await Promise.all(
      expired.map(async (record) => await ctx.db.delete("agent_host_replay_records", record._id)),
    );
    return { deleted: expired.length };
  },
});
export const cascadeRevokedAgentHost = internalMutation({
  args: {
    hostId: v.id("agent_hosts"),
    phase: v.union(v.literal("pending"), v.literal("active"), v.literal("expired")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const host = await ctx.db.get("agent_hosts", args.hostId);
    if (host === null || host.status !== "revoked") return null;
    const { page: agents } = await getPage(ctx, {
      table: "agents",
      index: "by_host_status",
      startIndexKey: [host._id, args.phase],
      endIndexKey: [host._id, args.phase],
      absoluteMaxRows: HOST_REVOCATION_BATCH_SIZE,
      schema,
    });
    const now = Date.now();
    await Promise.all(
      agents.map(async (agent) => {
        await revokeAgentDependents(ctx, agent, {
          now,
          reason: "Parent agent host revoked",
        });
        await ctx.db.patch("agents", agent._id, {
          status: "revoked",
          revokedAt: now,
          updatedAt: now,
        });
        await audit(ctx, {
          organizationId: host.organizationId,
          hostId: host._id,
          agentId: agent._id,
          actorType: "system",
          eventType: "agent.revoked_by_host",
        });
      }),
    );
    if (agents.length === HOST_REVOCATION_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.agentAuth.cascadeRevokedAgentHost, args);
      return null;
    }
    const nextPhase =
      args.phase === "pending" ? "active" : args.phase === "active" ? "expired" : null;
    if (nextPhase !== null) {
      await ctx.scheduler.runAfter(0, internal.agentAuth.cascadeRevokedAgentHost, {
        hostId: host._id,
        phase: nextPhase,
      });
      return null;
    }
    await ctx.db.patch("agent_hosts", host._id, {
      cascadeCompletedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

async function insertPendingAgent(
  ctx: MutationCtx,
  args: RegisterAgentArgs,
): Promise<Id<"agents">> {
  const host = await requireHostInOrganization(ctx, args.hostId, args.organizationId);
  await requireActiveOrganization(ctx, args.organizationId);
  if (host.status !== "active") throw new Error("Agent host is not active");
  await requireModeOwner(ctx, args);
  if (args.requestedGrants.length > MAX_AGENT_GRANTS) {
    throw new Error("Agent capability grant limit exceeded");
  }
  const grants = normalizeGrantInputs(args.requestedGrants);
  const publicKey = await normalizePublicEd25519Jwk(args.publicJwkJson);
  await requireUnusedThumbprint(ctx, publicKey.thumbprint);
  const now = Date.now();
  const agentId = await ctx.db.insert("agents", {
    organizationId: args.organizationId,
    hostId: args.hostId,
    name: requireText(args.name, "name"),
    mode: args.mode,
    status: "pending",
    delegatedUserId: args.mode === "delegated" ? args.delegatedUserId : undefined,
    permissions: normalizeStringSet(args.permissions, "permission", MAX_AGENT_PERMISSIONS),
    activeKeyGeneration: 1,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("agent_keys", {
    agentId,
    generation: 1,
    thumbprint: publicKey.thumbprint,
    publicJwkJson: publicKey.json,
    status: "active",
    createdAt: now,
  });
  await Promise.all(
    grants.map(async (grant) => {
      await ctx.db.insert("agent_capability_grants", {
        organizationId: args.organizationId,
        agentId,
        capability: grant.capability,
        constraintsJson: grant.constraintsJson,
        status: "pending",
        expiresAt: grant.expiresAt,
        createdAt: now,
        updatedAt: now,
      });
    }),
  );
  await audit(ctx, {
    organizationId: args.organizationId,
    hostId: args.hostId,
    agentId,
    actorType: "host",
    eventType: "agent.registered",
  });
  return agentId;
}

async function readActiveAgentGrants(
  ctx: DbCtx,
  agentId: Id<"agents">,
): Promise<Array<Doc<"agent_capability_grants">>> {
  const { page: grants } = await getPage(ctx, {
    table: "agent_capability_grants",
    index: "by_agent_status",
    startIndexKey: [agentId, "active"],
    endIndexKey: [agentId, "active"],
    absoluteMaxRows: MAX_AGENT_GRANTS + 1,
    schema,
  });
  if (grants.length > MAX_AGENT_GRANTS) {
    throw new Error("Agent capability grant limit exceeded");
  }
  return grants;
}

function grantSnapshot(grant: Doc<"agent_capability_grants">) {
  return {
    capability: grant.capability,
    constraintsJson: grant.constraintsJson,
    expiresAt: grant.expiresAt,
  };
}

async function revokeAgentGrants(
  ctx: MutationCtx,
  agentId: Id<"agents">,
  input: { now: number; reason: string },
): Promise<void> {
  const { page: grants } = await getPage(ctx, {
    table: "agent_capability_grants",
    index: "by_agent_status",
    startIndexKey: [agentId],
    endIndexKey: [agentId],
    absoluteMaxRows: MAX_AGENT_GRANTS + 1,
    schema,
  });
  if (grants.length > MAX_AGENT_GRANTS) {
    throw new Error("Agent capability grant limit exceeded");
  }
  await Promise.all(
    grants
      .filter((grant) => grant.status === "pending" || grant.status === "active")
      .map(
        async (grant) =>
          await ctx.db.patch("agent_capability_grants", grant._id, {
            status: "revoked",
            reason: input.reason,
            updatedAt: input.now,
          }),
      ),
  );
}

async function revokeAgentDependents(
  ctx: MutationCtx,
  agent: Doc<"agents">,
  input: { now: number; reason: string },
): Promise<void> {
  const [key, pendingAuthorizations, approvedAuthorizations] = await Promise.all([
    requireAgentKey(ctx, agent._id, agent.activeKeyGeneration),
    getPage(ctx, {
      table: "agent_device_authorizations",
      index: "by_agent_status",
      startIndexKey: [agent._id, "pending"],
      endIndexKey: [agent._id, "pending"],
      absoluteMaxRows: 2,
      schema,
    }).then((r) => r.page),
    getPage(ctx, {
      table: "agent_device_authorizations",
      index: "by_agent_status",
      startIndexKey: [agent._id, "approved"],
      endIndexKey: [agent._id, "approved"],
      absoluteMaxRows: 2,
      schema,
    }).then((r) => r.page),
  ]);
  if (pendingAuthorizations.length > 1 || approvedAuthorizations.length > 1) {
    throw new Error("Agent has multiple pending device authorizations");
  }
  const authorizations = [
    ...pendingAuthorizations,
    ...approvedAuthorizations.filter((authorization) => authorization.consumedAt === undefined),
  ];
  await Promise.all([
    key.status === "active"
      ? ctx.db.patch("agent_keys", key._id, {
          status: "revoked",
          retiredAt: input.now,
        })
      : Promise.resolve(),
    ...authorizations.map(
      async (authorization) =>
        await ctx.db.patch("agent_device_authorizations", authorization._id, {
          status: "denied",
          deniedAt: input.now,
          updatedAt: input.now,
        }),
    ),
    revokeAgentGrants(ctx, agent._id, input),
  ]);
}

function requireDeviceAuthorizationPolicy(
  input: {
    userCodeHash: string;
    deviceCodeHash: string;
    expiresAt: number;
    pollIntervalSeconds: number;
  },
  now: number,
): void {
  requireHash(input.userCodeHash, "userCodeHash");
  requireHash(input.deviceCodeHash, "deviceCodeHash");
  if (
    !Number.isSafeInteger(input.expiresAt) ||
    input.expiresAt <= now ||
    input.expiresAt > now + MAX_DEVICE_AUTHORIZATION_LIFETIME_MS
  ) {
    throw new TypeError(
      `Device authorization expiresAt must be within ${MAX_DEVICE_AUTHORIZATION_LIFETIME_MS} milliseconds`,
    );
  }
  if (
    !Number.isSafeInteger(input.pollIntervalSeconds) ||
    input.pollIntervalSeconds < MIN_DEVICE_AUTHORIZATION_POLL_INTERVAL_SECONDS ||
    input.pollIntervalSeconds > MAX_DEVICE_AUTHORIZATION_POLL_INTERVAL_SECONDS
  ) {
    throw new TypeError(
      `Device authorization pollIntervalSeconds must be between ${MIN_DEVICE_AUTHORIZATION_POLL_INTERVAL_SECONDS} and ${MAX_DEVICE_AUTHORIZATION_POLL_INTERVAL_SECONDS}`,
    );
  }
}

function requireHash(value: string, field: string): string {
  const normalized = requireText(value, field);
  if (!/^[A-Za-z0-9_-]{43}$/u.test(normalized)) {
    throw new TypeError(`${field} must be a SHA-256 base64url digest`);
  }
  return normalized;
}

async function requireUnusedDeviceAuthorizationCodes(
  ctx: DbCtx,
  userCodeHash: string,
  deviceCodeHash: string,
): Promise<void> {
  const [byUserCode, byDeviceCode] = await Promise.all([
    getOneFrom(
      ctx.db,
      "agent_device_authorizations",
      "by_user_code_hash",
      requireHash(userCodeHash, "userCodeHash"),
      "userCodeHash",
    ),
    getOneFrom(
      ctx.db,
      "agent_device_authorizations",
      "by_device_code_hash",
      requireHash(deviceCodeHash, "deviceCodeHash"),
      "deviceCodeHash",
    ),
  ]);
  if (byUserCode !== null || byDeviceCode !== null) {
    throw new Error("Device authorization code is already registered");
  }
}

type DeviceAuthorizationAttemptLimit = {
  allowed: boolean;
  attempts: number;
  windowStartedAt: number;
  retryAt?: number;
  recordId?: Id<"agent_device_authorization_attempts">;
};

async function readDeviceAuthorizationAttemptLimit(
  ctx: DbCtx,
  operatorUserId: Id<"users">,
  now: number,
): Promise<DeviceAuthorizationAttemptLimit> {
  const record = await getOneFrom(
    ctx.db,
    "agent_device_authorization_attempts",
    "by_operator",
    operatorUserId,
    "operatorUserId",
  );
  if (record === null) {
    return { allowed: true, attempts: 0, windowStartedAt: now };
  }
  if (record.blockedUntil !== undefined && record.blockedUntil > now) {
    return {
      allowed: false,
      attempts: record.attempts,
      windowStartedAt: record.windowStartedAt,
      retryAt: record.blockedUntil,
      recordId: record._id,
    };
  }
  if (record.windowStartedAt + DEVICE_AUTHORIZATION_ATTEMPT_WINDOW_MS <= now) {
    return {
      allowed: true,
      attempts: 0,
      windowStartedAt: now,
      recordId: record._id,
    };
  }
  return {
    allowed: record.attempts < DEVICE_AUTHORIZATION_ATTEMPT_LIMIT,
    attempts: record.attempts,
    windowStartedAt: record.windowStartedAt,
    ...(record.attempts >= DEVICE_AUTHORIZATION_ATTEMPT_LIMIT
      ? { retryAt: record.blockedUntil ?? now + DEVICE_AUTHORIZATION_BLOCK_MS }
      : {}),
    recordId: record._id,
  };
}

async function recordFailedDeviceAuthorizationAttempt(
  ctx: MutationCtx,
  operatorUserId: Id<"users">,
  current: DeviceAuthorizationAttemptLimit,
  now: number,
): Promise<void> {
  const attempts = current.attempts + 1;
  const blockedUntil =
    attempts >= DEVICE_AUTHORIZATION_ATTEMPT_LIMIT
      ? now + DEVICE_AUTHORIZATION_BLOCK_MS
      : undefined;
  const patch = {
    attempts,
    windowStartedAt: current.windowStartedAt,
    blockedUntil,
    updatedAt: now,
  };
  if (current.recordId === undefined) {
    await ctx.db.insert("agent_device_authorization_attempts", {
      operatorUserId,
      ...patch,
    });
  } else {
    await ctx.db.patch("agent_device_authorization_attempts", current.recordId, patch);
  }
}

async function clearDeviceAuthorizationAttempts(
  ctx: MutationCtx,
  operatorUserId: Id<"users">,
): Promise<void> {
  const record = await getOneFrom(
    ctx.db,
    "agent_device_authorization_attempts",
    "by_operator",
    operatorUserId,
    "operatorUserId",
  );
  if (record !== null) {
    await ctx.db.delete("agent_device_authorization_attempts", record._id);
  }
}

async function expirePendingDeviceAuthorization(
  ctx: MutationCtx,
  authorization: Doc<"agent_device_authorizations">,
  agent: Doc<"agents">,
  now: number,
): Promise<void> {
  if (authorization.status !== "pending") return;
  await ctx.db.patch("agent_device_authorizations", authorization._id, {
    status: "expired",
    updatedAt: now,
  });
  if (agent.status === "pending") {
    await ctx.db.patch("agents", agent._id, {
      status: "rejected",
      revokedAt: now,
      updatedAt: now,
    });
  }
  await audit(ctx, {
    organizationId: authorization.organizationId,
    hostId: authorization.hostId,
    agentId: authorization.agentId,
    actorType: "system",
    eventType: "agent.device_authorization.expired",
  });
}

async function requireActiveOperator(
  ctx: DbCtx,
  organizationId: Id<"organizations">,
  userId: Id<"users">,
) {
  await requireActiveOrganization(ctx, organizationId);
  const user = await ctx.db.get("users", userId);
  if (user === null || !user.isActive) throw new Error("User is not active");
  const membership = await findOrganizationMemberByUser(ctx, userId, organizationId);
  if (membership === null || membership.status !== "active") {
    throw new Error("User is not an active organization member");
  }
  const role = await ctx.db.get("organization_roles", membership.roleId);
  if (role === null || role.organizationId !== organizationId) {
    throw new Error("User organization role is invalid");
  }
  return role.permissions;
}

async function requireModeOwner(
  ctx: DbCtx,
  args: {
    organizationId: Id<"organizations">;
    mode: "delegated" | "autonomous";
    delegatedUserId?: Id<"users">;
  },
) {
  if (args.mode === "delegated") {
    if (args.delegatedUserId === undefined) {
      throw new Error("Delegated agents require delegatedUserId");
    }
    await requireActiveOperator(ctx, args.organizationId, args.delegatedUserId);
  } else if (args.delegatedUserId !== undefined) {
    throw new Error("Autonomous agents cannot have delegatedUserId");
  }
}

async function requireStoredModeOwner(ctx: DbCtx, agent: Doc<"agents">) {
  if (agent.mode === "autonomous") return null;
  if (agent.delegatedUserId === undefined) {
    throw new Error("Delegated agents require delegatedUserId");
  }
  return await requireActiveOperator(ctx, agent.organizationId, agent.delegatedUserId);
}

async function inspectStoredModeOwner(
  ctx: DbCtx,
  agent: Doc<"agents">,
): Promise<{ active: true; permissions: string[] | null } | { active: false; permissions: null }> {
  if (agent.mode === "autonomous") {
    return { active: true, permissions: null };
  }
  if (agent.delegatedUserId === undefined) {
    return { active: false, permissions: null };
  }
  const delegatedUserId = agent.delegatedUserId;
  const user = await ctx.db.get("users", delegatedUserId);
  if (user === null || !user.isActive) {
    return { active: false, permissions: null };
  }
  const membership = await findOrganizationMemberByUser(ctx, delegatedUserId, agent.organizationId);
  if (membership === null || membership.status !== "active") {
    return { active: false, permissions: null };
  }
  const role = await ctx.db.get("organization_roles", membership.roleId);
  if (role === null || role.organizationId !== agent.organizationId) {
    return { active: false, permissions: null };
  }
  return { active: true, permissions: role.permissions };
}

async function requireActiveOrganization(ctx: DbCtx, organizationId: Id<"organizations">) {
  const organization = await ctx.db.get("organizations", organizationId);
  if (organization === null || organization.status !== "active") {
    throw new Error("Organization is not active");
  }
}

async function requireHostInOrganization(
  ctx: DbCtx,
  hostId: Id<"agent_hosts">,
  organizationId: Id<"organizations">,
) {
  const host = await ctx.db.get("agent_hosts", hostId);
  if (host === null || host.organizationId !== organizationId) {
    throw new Error("Agent host not found");
  }
  return host;
}

async function requireAgentInOrganization(
  ctx: DbCtx,
  agentId: Id<"agents">,
  organizationId: Id<"organizations">,
) {
  const agent = await ctx.db.get("agents", agentId);
  if (agent === null || agent.organizationId !== organizationId) {
    throw new Error("Agent not found");
  }
  return agent;
}

async function findAgentCapabilityGrant(ctx: DbCtx, agentId: Id<"agents">, capability: string) {
  const { page } = await getPage(ctx, {
    table: "agent_capability_grants",
    index: "by_agent_capability",
    startIndexKey: [agentId, capability],
    endIndexKey: [agentId, capability],
    absoluteMaxRows: 1,
    schema,
  });
  return page[0] ?? null;
}

async function findOrganizationMemberByUser(
  ctx: DbCtx,
  userId: Id<"users">,
  organizationId: Id<"organizations">,
) {
  const { page } = await getPage(ctx, {
    table: "organization_members",
    index: "by_user_organization",
    startIndexKey: [userId, organizationId],
    endIndexKey: [userId, organizationId],
    absoluteMaxRows: 1,
    schema,
  });
  return page[0] ?? null;
}

async function findAgentKeyByAgentAndGeneration(
  ctx: DbCtx,
  agentId: Id<"agents">,
  generation: number,
) {
  const { page } = await getPage(ctx, {
    table: "agent_keys",
    index: "by_agent_generation",
    startIndexKey: [agentId, generation],
    endIndexKey: [agentId, generation],
    absoluteMaxRows: 1,
    schema,
  });
  return page[0] ?? null;
}

async function requireAgentKey(ctx: DbCtx, agentId: Id<"agents">, generation: number) {
  const key = await findAgentKeyByAgentAndGeneration(ctx, agentId, generation);
  if (key === null) throw new Error("Agent key not found");
  return key;
}

async function findHostKeyByHostAndGeneration(
  ctx: DbCtx,
  hostId: Id<"agent_hosts">,
  generation: number,
) {
  const { page } = await getPage(ctx, {
    table: "agent_host_keys",
    index: "by_host_generation",
    startIndexKey: [hostId, generation],
    endIndexKey: [hostId, generation],
    absoluteMaxRows: 1,
    schema,
  });
  return page[0] ?? null;
}

async function requireHostKey(ctx: DbCtx, hostId: Id<"agent_hosts">, generation: number) {
  const key = await findHostKeyByHostAndGeneration(ctx, hostId, generation);
  if (key === null) throw new Error("Agent host key not found");
  return key;
}

async function requireUnusedThumbprint(ctx: DbCtx, thumbprint: string) {
  const [agentKey, hostKey] = await Promise.all([
    getOneFrom(ctx.db, "agent_keys", "by_thumbprint", thumbprint, "thumbprint"),
    getOneFrom(ctx.db, "agent_host_keys", "by_thumbprint", thumbprint, "thumbprint"),
  ]);
  if (agentKey !== null || hostKey !== null) {
    throw new Error("Agent Auth public key is already registered");
  }
}

async function normalizePublicEd25519Jwk(publicJwkJson: string) {
  const parsed: unknown = JSON.parse(publicJwkJson);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError("Public JWK must be an object");
  }
  const record = Object.fromEntries(Object.entries(parsed));
  if (
    record.kty !== "OKP" ||
    record.crv !== "Ed25519" ||
    typeof record.x !== "string" ||
    Object.hasOwn(record, "d")
  ) {
    throw new TypeError("Only public Ed25519 JWKs are accepted");
  }
  const publicKeyBytes = base64UrlToBytes(record.x);
  if (publicKeyBytes.length !== 32 || bytesToBase64Url(publicKeyBytes) !== record.x) {
    throw new TypeError("Ed25519 public key material is invalid");
  }
  const canonical = JSON.stringify({
    crv: "Ed25519",
    kty: "OKP",
    x: record.x,
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return {
    json: canonical,
    thumbprint: bytesToBase64Url(new Uint8Array(digest)),
  };
}

function bytesToBase64Url(bytes: Uint8Array) {
  return bytesToBase64url(bytes);
}

function base64UrlToBytes(value: string) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new TypeError("Public JWK x must be base64url");
  }
  try {
    return base64urlToBytes(value);
  } catch {
    throw new TypeError("Public JWK x must be base64url");
  }
}

function normalizeGrantInputs(
  inputs: Array<{
    capability: string;
    constraintsJson?: string;
    expiresAt?: number;
  }>,
) {
  const seen = new Set<string>();
  return inputs.map((input) => {
    const capability = requireText(input.capability, "capability");
    if (capability.length > 128) {
      throw new TypeError("Capability exceeds 128 characters");
    }
    if (seen.has(capability)) {
      throw new TypeError(`Duplicate capability: ${capability}`);
    }
    seen.add(capability);
    if (input.constraintsJson !== undefined) {
      if (input.constraintsJson.length > MAX_CAPABILITY_CONSTRAINTS_JSON_LENGTH) {
        throw new TypeError(
          `Capability constraints exceed ${MAX_CAPABILITY_CONSTRAINTS_JSON_LENGTH} characters`,
        );
      }
      const constraints: unknown = JSON.parse(input.constraintsJson);
      if (typeof constraints !== "object" || constraints === null || Array.isArray(constraints)) {
        throw new TypeError("Capability constraints must be an object");
      }
    }
    requireOptionalTimestamp(input.expiresAt, "grant expiresAt");
    return {
      capability,
      constraintsJson: input.constraintsJson,
      expiresAt: input.expiresAt,
    };
  });
}

function normalizeStringSet(values: string[], field: string, limit: number) {
  if (values.length > limit) {
    throw new TypeError(`Agent ${field} limit exceeded`);
  }
  return [
    ...new Set(
      values.map((value) => {
        const normalized = requireText(value, field);
        if (normalized.length > 128) {
          throw new TypeError(`${field} exceeds 128 characters`);
        }
        return normalized;
      }),
    ),
  ].toSorted();
}

function requireText(value: string, field: string) {
  const normalized = value.trim();
  if (normalized.length === 0) throw new TypeError(`${field} is required`);
  return normalized;
}

function requireHostStatusTransition(
  current: Doc<"agent_hosts">["status"],
  next: Doc<"agent_hosts">["status"],
) {
  const allowed =
    current === "pending"
      ? new Set(["active", "rejected", "revoked"])
      : new Set(["rejected", "revoked"]);
  if (!allowed.has(next)) {
    throw new Error(`Invalid agent host transition: ${current} -> ${next}`);
  }
}

function requireAgentStatusTransition(
  current: Doc<"agents">["status"],
  next: Doc<"agents">["status"],
) {
  const allowed =
    current === "pending"
      ? new Set(["active", "rejected", "revoked"])
      : current === "active"
        ? new Set(["expired", "revoked"])
        : new Set(["revoked"]);
  if (!allowed.has(next)) {
    throw new Error(`Invalid agent transition: ${current} -> ${next}`);
  }
}

function requireCapabilityStatusTransition(
  current: Doc<"agent_capability_grants">["status"],
  next: Doc<"agent_capability_grants">["status"],
) {
  const allowed =
    current === "pending"
      ? new Set(["active", "denied"])
      : current === "active"
        ? new Set(["revoked"])
        : new Set<string>();
  if (!allowed.has(next)) {
    throw new Error(`Invalid agent capability transition: ${current} -> ${next}`);
  }
}

function requireOptionalTimestamp(value: number | undefined, field: string) {
  if (value !== undefined && !Number.isSafeInteger(value)) {
    throw new TypeError(`${field} must be a safe integer`);
  }
}

function requireReplayLifetime(replayExpiresAt: number, now: number): void {
  if (replayExpiresAt <= now) throw new Error("Agent credential expired");
  if (
    !Number.isSafeInteger(replayExpiresAt) ||
    replayExpiresAt > now + MAX_CREDENTIAL_REPLAY_LIFETIME_MS
  ) {
    throw new Error("Agent credential replay lifetime is invalid");
  }
}

function requireReplayCleanupLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_REPLAY_CLEANUP_BATCH) {
    throw new Error(`Agent replay cleanup limit must be between 1 and ${MAX_REPLAY_CLEANUP_BATCH}`);
  }
}

function requireExpectedGeneration(expected: number, current: number, subject: string): void {
  if (!Number.isSafeInteger(expected) || expected < 1) {
    throw new TypeError(`${subject} expected generation is invalid`);
  }
  if (expected !== current) {
    throw new Error(`${subject} key generation changed`);
  }
}

type LifecycleActor =
  | { actorUserId: Id<"users">; actorType?: never }
  | { actorType: "host" | "agent"; actorUserId?: never };

async function requireHostOwnedAgent(
  ctx: DbCtx,
  input: {
    hostId: Id<"agent_hosts">;
    agentId: Id<"agents">;
    organizationId: Id<"organizations">;
  },
): Promise<Doc<"agents">> {
  const [host, agent] = await Promise.all([
    requireHostInOrganization(ctx, input.hostId, input.organizationId),
    requireAgentInOrganization(ctx, input.agentId, input.organizationId),
  ]);
  if (host.status !== "active") throw new Error("Agent host is not active");
  if (agent.hostId !== host._id) {
    throw new Error("Agent is not owned by the authenticated host");
  }
  return agent;
}

async function rotateHostKey(
  ctx: MutationCtx,
  host: Doc<"agent_hosts">,
  input: {
    expectedGeneration: number;
    publicJwkJson: string;
  } & LifecycleActor,
) {
  if (host.status !== "active") throw new Error("Agent host is not active");
  requireExpectedGeneration(input.expectedGeneration, host.activeKeyGeneration, "Agent host");
  const publicKey = await normalizePublicEd25519Jwk(input.publicJwkJson);
  await requireUnusedThumbprint(ctx, publicKey.thumbprint);
  const current = await requireHostKey(ctx, host._id, host.activeKeyGeneration);
  const now = Date.now();
  const generation = host.activeKeyGeneration + 1;
  await ctx.db.patch("agent_host_keys", current._id, {
    status: "rotated",
    retiredAt: now,
  });
  await ctx.db.insert("agent_host_keys", {
    hostId: host._id,
    generation,
    thumbprint: publicKey.thumbprint,
    publicJwkJson: publicKey.json,
    status: "active",
    createdAt: now,
  });
  await ctx.db.patch("agent_hosts", host._id, {
    activeKeyGeneration: generation,
    updatedAt: now,
  });
  await audit(ctx, {
    organizationId: host.organizationId,
    hostId: host._id,
    ...(input.actorUserId === undefined
      ? { actorType: input.actorType }
      : { actorUserId: input.actorUserId }),
    eventType: "agent_host.key_rotated",
  });
  return { generation, thumbprint: publicKey.thumbprint };
}

async function reactivateStoredAgent(
  ctx: MutationCtx,
  agent: Doc<"agents">,
  input: { expiresAt: number } & LifecycleActor,
) {
  if (agent.status !== "expired") {
    throw new Error("Only expired agents can reactivate");
  }
  const host = await requireHostInOrganization(ctx, agent.hostId, agent.organizationId);
  if (host.status !== "active") throw new Error("Agent host is not active");
  await requireStoredModeOwner(ctx, agent);
  const now = Date.now();
  requireOptionalTimestamp(input.expiresAt, "expiresAt");
  const auditActor =
    input.actorUserId === undefined
      ? ({ actorType: input.actorType } as const)
      : { actorUserId: input.actorUserId };
  if (agent.absoluteExpiresAt !== undefined && agent.absoluteExpiresAt <= now) {
    await revokeAgentDependents(ctx, agent, {
      now,
      reason: "Agent absolute lifetime expired",
    });
    await ctx.db.patch("agents", agent._id, {
      status: "revoked",
      ...(input.actorUserId === undefined ? {} : { revokedBy: input.actorUserId }),
      revokedAt: now,
      updatedAt: now,
    });
    await audit(ctx, {
      organizationId: agent.organizationId,
      hostId: agent.hostId,
      agentId: agent._id,
      ...auditActor,
      eventType: "agent.absolute_lifetime_revoked",
    });
    return { status: "revoked" } as const;
  }
  if (
    input.expiresAt <= now ||
    (agent.absoluteExpiresAt !== undefined && input.expiresAt > agent.absoluteExpiresAt)
  ) {
    throw new Error("Agent reactivation expiry is invalid");
  }
  await revokeAgentGrants(ctx, agent._id, {
    now,
    reason: "Grant decayed during agent reactivation",
  });
  await ctx.db.patch("agents", agent._id, {
    status: "active",
    ...(input.actorUserId === undefined ? {} : { activatedBy: input.actorUserId }),
    activatedAt: now,
    expiresAt: input.expiresAt,
    updatedAt: now,
  });
  await audit(ctx, {
    organizationId: agent.organizationId,
    hostId: agent.hostId,
    agentId: agent._id,
    ...auditActor,
    eventType: "agent.reactivated",
  });
  return { status: "active" } as const;
}

async function rotateStoredAgentKey(
  ctx: MutationCtx,
  agent: Doc<"agents">,
  input: {
    expectedGeneration: number;
    publicJwkJson: string;
  } & LifecycleActor,
) {
  if (agent.status !== "active") throw new Error("Agent is not active");
  requireExpectedGeneration(input.expectedGeneration, agent.activeKeyGeneration, "Agent");
  const publicKey = await normalizePublicEd25519Jwk(input.publicJwkJson);
  await requireUnusedThumbprint(ctx, publicKey.thumbprint);
  const current = await requireAgentKey(ctx, agent._id, agent.activeKeyGeneration);
  const now = Date.now();
  const generation = agent.activeKeyGeneration + 1;
  await ctx.db.patch("agent_keys", current._id, {
    status: "rotated",
    retiredAt: now,
  });
  await ctx.db.insert("agent_keys", {
    agentId: agent._id,
    generation,
    thumbprint: publicKey.thumbprint,
    publicJwkJson: publicKey.json,
    status: "active",
    createdAt: now,
  });
  await ctx.db.patch("agents", agent._id, {
    activeKeyGeneration: generation,
    updatedAt: now,
  });
  await audit(ctx, {
    organizationId: agent.organizationId,
    hostId: agent.hostId,
    agentId: agent._id,
    ...(input.actorUserId === undefined
      ? { actorType: input.actorType }
      : { actorUserId: input.actorUserId }),
    eventType: "agent.key_rotated",
  });
  return { generation, thumbprint: publicKey.thumbprint };
}

async function audit(
  ctx: Pick<MutationCtx, "db">,
  input: {
    organizationId: Id<"organizations">;
    hostId?: Id<"agent_hosts">;
    agentId?: Id<"agents">;
    actorType?: "user" | "host" | "agent" | "system";
    actorUserId?: Id<"users">;
    eventType: string;
    reasonCode?: string;
  },
) {
  await ctx.db.insert("agent_auth_audit_events", {
    ...input,
    actorType: input.actorType ?? "user",
    createdAt: Date.now(),
  });
}

export {
  agentCapabilityGrantStatusValidator,
  agentDeviceAuthorizationStatusValidator,
  agentHostStatusValidator,
  agentKeyStatusValidator,
  agentModeValidator,
  agentStatusValidator,
};
