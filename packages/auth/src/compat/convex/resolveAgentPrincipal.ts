import type { AgentCapabilityGrantSnapshot, AgentMode, AgentPrincipal } from "../../core";

export type AgentPrincipalInput = {
  agentId: string;
  hostId: string;
  organizationId: string;
  mode: AgentMode;
  delegatedUserId: string | null;
  credentialId: string;
  permissions: readonly string[];
  capabilityGrants: readonly AgentCapabilityGrantSnapshot[];
  isRestricted?: boolean;
  restrictedReason?: string | null;
};

export function resolveAgentPrincipal(input: AgentPrincipalInput): AgentPrincipal {
  const agentId = requireIdentifier(input.agentId, "agentId");
  const hostId = requireIdentifier(input.hostId, "hostId");
  const organizationId = requireIdentifier(input.organizationId, "organizationId");
  const credentialId = requireIdentifier(input.credentialId, "credentialId");
  const delegatedUserId = resolveDelegatedUserId(input.mode, input.delegatedUserId);
  const restrictedReason = input.restrictedReason ?? null;

  return {
    kind: "agent",
    agentId,
    hostId,
    organizationId,
    mode: input.mode,
    delegatedUserId,
    credentialId,
    permissions: normalizeStringSet(input.permissions),
    capabilityGrants: normalizeCapabilityGrants(input.capabilityGrants),
    isRestricted: input.isRestricted ?? false,
    restrictedReason,
  };
}

function resolveDelegatedUserId(mode: AgentMode, delegatedUserId: string | null): string | null {
  if (mode === "delegated") {
    if (delegatedUserId === null) {
      throw new TypeError("Delegated agents require delegatedUserId");
    }
    return requireIdentifier(delegatedUserId, "delegatedUserId");
  }
  if (delegatedUserId !== null) {
    throw new TypeError("Autonomous agents cannot have delegatedUserId");
  }
  return null;
}

function normalizeCapabilityGrants(
  grants: readonly AgentCapabilityGrantSnapshot[],
): AgentCapabilityGrantSnapshot[] {
  const byCapability = new Map<string, AgentCapabilityGrantSnapshot>();
  for (const grant of grants) {
    const capability = requireIdentifier(grant.capability, "capability");
    if (byCapability.has(capability)) {
      throw new TypeError(`Duplicate capability grant: ${capability}`);
    }
    if (
      grant.expiresAt !== null &&
      (!Number.isSafeInteger(grant.expiresAt) || grant.expiresAt <= 0)
    ) {
      throw new TypeError(`Invalid capability expiry: ${capability}`);
    }
    byCapability.set(capability, {
      capability,
      constraints: grant.constraints,
      expiresAt: grant.expiresAt,
    });
  }
  return [...byCapability.values()].toSorted((left, right) =>
    left.capability.localeCompare(right.capability),
  );
}

function normalizeStringSet(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => requireIdentifier(value, "permission")))].toSorted();
}

function requireIdentifier(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`${field} is required`);
  }
  return normalized;
}
