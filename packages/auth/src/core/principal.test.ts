import assert from "node:assert/strict";

import { describe, it } from "vitest";

import type { AgentPrincipal, AnonymousPrincipal, AuthPrincipal, UserPrincipal } from "./principal";

describe("principal types", () => {
  it("UserPrincipal has all required fields", () => {
    const p: UserPrincipal = {
      kind: "user",
      userId: "u1",
      identityId: "id1",
      activeOrganizationId: "o1",
      membershipIds: ["m1"],
      roleKeys: ["admin"],
      permissions: ["read"],
      sessionId: "s1",
      isRestricted: false,
      restrictedReason: null,
    };
    assert.equal(p.kind, "user");
    assert.equal(p.userId, "u1");
  });

  it("AnonymousPrincipal has empty permissions", () => {
    const p: AnonymousPrincipal = {
      kind: "anonymous",
      permissions: [],
    };
    assert.equal(p.kind, "anonymous");
    assert.deepStrictEqual(p.permissions, []);
  });

  it("keeps an agent mechanically distinct from humans and services", () => {
    const agent: AgentPrincipal = {
      kind: "agent",
      agentId: "agent-1",
      hostId: "host-1",
      organizationId: "org-1",
      mode: "autonomous",
      delegatedUserId: null,
      credentialId: "agent-1:1",
      permissions: ["agents:invoke"],
      capabilityGrants: [],
      isRestricted: false,
      restrictedReason: null,
    };
    const principal: AuthPrincipal = agent;
    assert.equal(principal.kind, "agent");
    assert.equal(agent.delegatedUserId, null);
    assert.equal("userId" in agent, false);
    assert.equal("serviceId" in agent, false);
  });
});
