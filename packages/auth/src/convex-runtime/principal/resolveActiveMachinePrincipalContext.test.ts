import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  resolveActiveApiKeyContext,
  resolveActiveServiceOwnedApiKeyContext,
  resolveActiveServiceContext,
} from "./resolveActiveMachinePrincipalContext";

describe("resolveActiveApiKeyContext", () => {
  it("returns api key principal context for active key", () => {
    const context = resolveActiveApiKeyContext({
      apiKey: {
        apiKeyId: "key_123",
        ownerType: "user",
        ownerId: "user_123",
        fixedOrganizationId: "org_123",
        permissions: ["org:read"],
        status: "active",
        expiresAt: null,
      },
      ownerPermissions: ["org:read", "org:write"],
      input: {
        resourceType: "convex.query",
        resourceId: "organizations:list",
      },
    });

    assert.equal(context.principal.kind, "apiKey");
    assert.equal(context.principal.apiKeyId, "key_123");
    assert.deepStrictEqual(context.principal.effectivePermissions, ["org:read"]);
    assert.deepStrictEqual(context.execution, {
      organizationId: "org_123",
      resourceType: "convex.query",
      resourceId: "organizations:list",
      audience: null,
      scopes: [],
    });
  });

  it("rejects inactive api key before resolving principal", () => {
    assert.throws(
      () =>
        resolveActiveApiKeyContext({
          apiKey: {
            apiKeyId: "key_123",
            ownerType: "user",
            ownerId: "user_123",
            fixedOrganizationId: null,
            permissions: null,
            status: "revoked",
            expiresAt: null,
          },
          ownerPermissions: ["org:read"],
        }),
      /API key is not active: revoked/,
    );
  });
});

describe("resolveActiveServiceContext", () => {
  it("returns service principal context for active service", () => {
    const context = resolveActiveServiceContext({
      servicePrincipal: {
        serviceId: "svc_123",
        organizationId: "org_123",
        permissions: ["org:read"],
        status: "active",
      },
      keyId: "svc_key_123",
      input: {
        resourceType: "convex.mutation",
        resourceId: "services:sync",
      },
    });

    assert.equal(context.principal.kind, "service");
    assert.equal(context.principal.serviceId, "svc_123");
    assert.equal(context.principal.keyId, "svc_key_123");
    assert.deepStrictEqual(context.execution, {
      organizationId: "org_123",
      resourceType: "convex.mutation",
      resourceId: "services:sync",
      audience: null,
      scopes: [],
    });
  });

  it("rejects disabled service principal before resolving principal", () => {
    assert.throws(
      () =>
        resolveActiveServiceContext({
          servicePrincipal: {
            serviceId: "svc_123",
            organizationId: null,
            permissions: [],
            status: "disabled",
          },
        }),
      /Service principal is not active: disabled/,
    );
  });
});

describe("resolveActiveServiceOwnedApiKeyContext", () => {
  it("uses the service principal as the permission upper bound", () => {
    const context = resolveActiveServiceOwnedApiKeyContext({
      apiKey: {
        apiKeyId: "key_123",
        ownerType: "service",
        ownerId: "svc_123",
        fixedOrganizationId: null,
        permissions: ["org:read"],
        status: "active",
        expiresAt: null,
      },
      servicePrincipal: {
        serviceId: "svc_123",
        organizationId: "org_123",
        permissions: ["org:read", "org:write"],
        status: "active",
      },
      input: {
        resourceType: "mcp.tool",
        resourceId: "app.contacts.search",
        scopes: ["mcp:tools:execute"],
      },
    });

    assert.equal(context.principal.kind, "apiKey");
    assert.equal(context.principal.ownerType, "service");
    assert.equal(context.servicePrincipal.kind, "service");
    assert.equal(context.servicePrincipal.keyId, "key_123");
    assert.deepStrictEqual(context.principal.inheritedPermissions, ["org:read", "org:write"]);
    assert.deepStrictEqual(context.principal.effectivePermissions, ["org:read"]);
    assert.deepStrictEqual(context.execution, {
      organizationId: "org_123",
      resourceType: "mcp.tool",
      resourceId: "app.contacts.search",
      audience: null,
      scopes: ["mcp:tools:execute"],
    });
  });

  it("keeps a fixed key organization from being overridden by request input", () => {
    const context = resolveActiveServiceOwnedApiKeyContext({
      apiKey: {
        apiKeyId: "key_123",
        ownerType: "service",
        ownerId: "svc_123",
        fixedOrganizationId: "org_fixed",
        permissions: null,
        status: "active",
        expiresAt: null,
      },
      servicePrincipal: {
        serviceId: "svc_123",
        organizationId: "org_service",
        permissions: ["org:read"],
        status: "active",
      },
      input: {
        organizationId: "org_requested",
      },
    });

    assert.equal(context.principal.organizationId, "org_fixed");
    assert.equal(context.execution.organizationId, "org_fixed");
    assert.equal(context.servicePrincipal.organizationId, "org_fixed");
  });

  it("rejects disabled service principals even when the key is active", () => {
    assert.throws(
      () =>
        resolveActiveServiceOwnedApiKeyContext({
          apiKey: {
            apiKeyId: "key_123",
            ownerType: "service",
            ownerId: "svc_123",
            fixedOrganizationId: null,
            permissions: null,
            status: "active",
            expiresAt: null,
          },
          servicePrincipal: {
            serviceId: "svc_123",
            organizationId: "org_123",
            permissions: ["org:read"],
            status: "disabled",
          },
        }),
      /Service principal is not active: disabled/,
    );
  });

  it("rejects API keys that are not owned by the resolved service", () => {
    assert.throws(
      () =>
        resolveActiveServiceOwnedApiKeyContext({
          apiKey: {
            apiKeyId: "key_123",
            ownerType: "service",
            ownerId: "svc_other",
            fixedOrganizationId: null,
            permissions: null,
            status: "active",
            expiresAt: null,
          },
          servicePrincipal: {
            serviceId: "svc_123",
            organizationId: "org_123",
            permissions: ["org:read"],
            status: "active",
          },
        }),
      /API key owner does not match service principal/,
    );
  });
});
