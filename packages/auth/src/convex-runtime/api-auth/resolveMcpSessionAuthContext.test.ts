import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { ApiAuthError } from "./errors";
import {
  normalizeMcpSessionScopes,
  resolveMcpSessionAuthContext,
} from "./resolveMcpSessionAuthContext";

describe("resolveMcpSessionAuthContext", () => {
  it("maps a verified external-provider MCP user session into an OAuth auth context", () => {
    const context = resolveMcpSessionAuthContext({
      session: {
        clientId: "mcp_client_123",
        userId: "user_123",
        scopes: "app:organization:read app:people:write",
      },
      organizationId: "org_123",
      permissions: ["organization:view", "people:write"],
      resourceType: "mcp.tool",
      resourceId: "app.people.search",
      audience: "example-mcp",
    });

    assert.equal(context.credentialType, "oauthToken");
    assert.equal(context.userId, "user_123");
    assert.equal(context.organizationId, "org_123");
    assert.deepStrictEqual(context.scopes, ["app:organization:read", "app:people:write"]);
    assert.deepStrictEqual(context.permissions, ["organization:view", "people:write"]);
    assert.deepStrictEqual(context.execution, {
      organizationId: "org_123",
      resourceType: "mcp.tool",
      resourceId: "app.people.search",
      audience: "example-mcp",
      scopes: ["app:organization:read", "app:people:write"],
    });
    assert.equal(context.principal.kind, "oauthClient");
    assert.equal(context.principal.clientId, "mcp_client_123");
    assert.equal(context.principal.subjectType, "user");
    assert.equal(context.principal.subjectId, "user_123");
  });

  it("supports client-only MCP sessions without pretending they are users", () => {
    const context = resolveMcpSessionAuthContext({
      session: {
        clientId: "mcp_client_only",
        scopes: ["app:organization:read"],
      },
      permissions: ["organization:view"],
    });

    assert.equal(context.userId, null);
    assert.equal(context.principal.kind, "oauthClient");
    assert.equal(context.principal.subjectType, "client");
    assert.equal(context.principal.subjectId, null);
  });

  it("rejects missing client ids because MCP clients must be attributable", () => {
    assert.throws(
      () =>
        resolveMcpSessionAuthContext({
          session: {
            userId: "user_123",
          },
        }),
      (error: unknown) => error instanceof ApiAuthError && error.code === "OAUTH_SESSION_INVALID",
    );
  });

  it("rejects restricted OAuth client principals", () => {
    assert.throws(
      () =>
        resolveMcpSessionAuthContext({
          session: {
            clientId: "mcp_client_123",
            userId: "user_123",
          },
          isRestricted: true,
          restrictedReason: "client_disabled",
        }),
      (error: unknown) => error instanceof ApiAuthError && error.code === "PRINCIPAL_RESTRICTED",
    );
  });
});

describe("normalizeMcpSessionScopes", () => {
  it("normalizes OAuth space-delimited scopes", () => {
    assert.deepStrictEqual(normalizeMcpSessionScopes(" read:one  write:two "), [
      "read:one",
      "write:two",
    ]);
  });

  it("normalizes and deduplicates array scopes", () => {
    assert.deepStrictEqual(normalizeMcpSessionScopes(["read:one", "read:one", " write:two "]), [
      "read:one",
      "write:two",
    ]);
  });
});
