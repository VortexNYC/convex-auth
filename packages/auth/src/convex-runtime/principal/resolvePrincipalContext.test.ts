/**
 * Coverage for the principal-context resolvers — the canonical
 * entry-points consumers use to build a `ResolvedAuthContext` for
 * downstream authorization checks (`authorizePermission`,
 * `authorizeNotRestricted`, etc).
 *
 * The contract under test: each resolver derives `organizationId` (and
 * audience/scopes for OAuth) from the principal when not explicitly
 * provided in input.
 */
import assert from "node:assert/strict";

import { describe, it } from "vitest";

import type {
  AgentPrincipal,
  ApiKeyPrincipal,
  OAuthClientPrincipal,
  ServicePrincipal,
  UserPrincipal,
} from "../coreTypes";
import {
  resolveAnonymousContext,
  resolveAgentContext,
  resolveApiKeyContext,
  resolveOAuthClientContext,
  resolvePrincipalContext,
  resolveServiceContext,
  resolveUserContext,
} from "./resolvePrincipalContext";

const baseInput = { resourceType: "convex.query", resourceId: "auth:probe" };

const baseUser: UserPrincipal = {
  kind: "user",
  userId: "u_1",
  identityId: null,
  activeOrganizationId: "org_default",
  membershipIds: [],
  roleKeys: [],
  permissions: ["org:read"],
  sessionId: null,
  isRestricted: false,
  restrictedReason: null,
};

const baseService: ServicePrincipal = {
  kind: "service",
  serviceId: "svc_1",
  keyId: null,
  organizationId: "org_svc",
  permissions: ["billing:read"],
  isRestricted: false,
  restrictedReason: null,
};

const baseAgent: AgentPrincipal = {
  kind: "agent",
  agentId: "agent_1",
  hostId: "host_1",
  organizationId: "org_agent",
  mode: "autonomous",
  delegatedUserId: null,
  credentialId: "agent_1:1",
  permissions: ["agents:invoke"],
  capabilityGrants: [],
  isRestricted: false,
  restrictedReason: null,
};

const baseApiKey: ApiKeyPrincipal = {
  kind: "apiKey",
  apiKeyId: "ak_1",
  ownerType: "user",
  ownerId: "u_1",
  organizationId: "org_ak",
  inheritedPermissions: [],
  narrowedPermissions: null,
  effectivePermissions: ["api:read"],
  isRestricted: false,
  restrictedReason: null,
};

const baseOAuth: OAuthClientPrincipal = {
  kind: "oauthClient",
  clientId: "client_1",
  subjectType: "user",
  subjectId: "u_1",
  organizationId: "org_oauth",
  audience: "https://example.com/api",
  scopes: ["app:read", "app:write"],
  permissions: ["app:read"],
  isRestricted: false,
  restrictedReason: null,
};

describe("resolveAnonymousContext", () => {
  it("returns a kind='anonymous' principal", () => {
    const ctx = resolveAnonymousContext(baseInput);
    assert.equal(ctx.principal.kind, "anonymous");
  });

  it("has no permissions on the anonymous principal", () => {
    const ctx = resolveAnonymousContext(baseInput);
    // Narrow via the discriminant — AuthPrincipal is a union.
    assert.equal(ctx.principal.kind, "anonymous");
    if (ctx.principal.kind === "anonymous") {
      assert.deepEqual(ctx.principal.permissions, []);
    }
  });

  it("propagates resourceType + resourceId to the execution context", () => {
    const ctx = resolveAnonymousContext(baseInput);
    assert.equal(ctx.execution.resourceType, "convex.query");
    assert.equal(ctx.execution.resourceId, "auth:probe");
  });
});

describe("resolveUserContext", () => {
  it("falls back to principal.activeOrganizationId when input lacks one", () => {
    const ctx = resolveUserContext(baseUser, baseInput);
    assert.equal(ctx.execution.organizationId, "org_default");
  });

  it("input.organizationId overrides principal default", () => {
    const ctx = resolveUserContext(baseUser, {
      ...baseInput,
      organizationId: "org_override",
    });
    assert.equal(ctx.execution.organizationId, "org_override");
  });

  it("attaches the user principal verbatim", () => {
    const ctx = resolveUserContext(baseUser, baseInput);
    assert.equal(ctx.principal, baseUser);
  });
});

describe("resolveServiceContext", () => {
  it("derives organizationId from the service principal", () => {
    const ctx = resolveServiceContext(baseService, baseInput);
    assert.equal(ctx.execution.organizationId, "org_svc");
  });

  it("input.organizationId overrides principal default", () => {
    const ctx = resolveServiceContext(baseService, {
      ...baseInput,
      organizationId: "org_override",
    });
    assert.equal(ctx.execution.organizationId, "org_override");
  });
});

describe("resolveAgentContext", () => {
  it("pins organizationId to the verified agent authority", () => {
    const ctx = resolveAgentContext(baseAgent, {
      ...baseInput,
      organizationId: "org_attacker",
    });
    assert.equal(ctx.execution.organizationId, "org_agent");
  });
});

describe("resolveApiKeyContext", () => {
  it("derives organizationId from the apiKey principal", () => {
    const ctx = resolveApiKeyContext(baseApiKey, baseInput);
    assert.equal(ctx.execution.organizationId, "org_ak");
  });
});

describe("resolveOAuthClientContext", () => {
  it("derives organizationId from the oauth principal", () => {
    const ctx = resolveOAuthClientContext(baseOAuth, baseInput);
    assert.equal(ctx.execution.organizationId, "org_oauth");
  });

  it("propagates audience + scopes from the principal", () => {
    const ctx = resolveOAuthClientContext(baseOAuth, baseInput);
    assert.equal(ctx.execution.audience, "https://example.com/api");
    assert.deepEqual(ctx.execution.scopes, ["app:read", "app:write"]);
  });

  it("input.audience + input.scopes override the principal defaults", () => {
    const ctx = resolveOAuthClientContext(baseOAuth, {
      ...baseInput,
      audience: "https://other.test/api",
      scopes: ["other:read"],
    });
    assert.equal(ctx.execution.audience, "https://other.test/api");
    assert.deepEqual(ctx.execution.scopes, ["other:read"]);
  });
});

describe("resolvePrincipalContext (low-level)", () => {
  it("attaches the principal verbatim + computes execution from input", () => {
    const ctx = resolvePrincipalContext(baseUser, {
      credentialType: "userToken",
      resourceType: "convex.action",
      resourceId: "test:probe",
    });
    assert.equal(ctx.principal, baseUser);
    assert.equal(ctx.execution.resourceType, "convex.action");
    assert.equal(ctx.execution.resourceId, "test:probe");
    assert.equal(ctx.execution.organizationId, null);
  });
});
