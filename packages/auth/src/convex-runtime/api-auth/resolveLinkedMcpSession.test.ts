import { strict as assert } from "node:assert";

import { describe, it } from "vitest";

import { ApiAuthError } from "./errors";
import { resolveLinkedMcpSession } from "./resolveLinkedMcpSession";

describe("resolveLinkedMcpSession", () => {
  it("resolves linked MCP user identity and organization access", async () => {
    const context = await resolveLinkedMcpSession({
      session: {
        accessToken: "token",
        clientId: "example-mcp-client",
        scopes: ["organization:read", "opportunities:read"],
        userId: "external-user-123",
      },
      provider: "convex-auth",
      issuer: "https://auth.example.com",
      buildTokenIdentifier: (subject, issuer) => `${issuer}|${subject}`,
      adapter: {
        async getUserByIdentity() {
          return {
            userId: "user_123",
            identityId: "identity_123",
            activeOrganizationId: "org_123",
            membershipIds: ["membership_123"],
            roleKeys: ["member"],
            permissions: [],
            isRestricted: false,
            restrictedReason: null,
          };
        },
        async getOrganizationAccess() {
          return {
            organizationId: "org_456",
            membershipIds: ["membership_456"],
            roleKeys: ["member"],
            permissions: ["organization:view"],
          };
        },
      },
      requestedOrganizationId: "org_456",
      audience: "example-mcp",
      resourceType: "mcp.tool",
      resourceId: "app:mcp",
    });

    assert.equal(context.subjectId, "external-user-123");
    assert.equal(context.userId, "user_123");
    assert.equal(context.organizationId, "org_456");
    assert.deepEqual(context.permissions, ["organization:view"]);
    assert.deepEqual(context.scopes, ["organization:read", "opportunities:read"]);
  });

  it("rejects client-only MCP sessions", async () => {
    await assert.rejects(
      () =>
        resolveLinkedMcpSession({
          session: {
            accessToken: "token",
            clientId: "example-mcp-client",
            scopes: ["organization:read"],
          },
          provider: "convex-auth",
          issuer: "https://auth.example.com",
          buildTokenIdentifier: (subject, issuer) => `${issuer}|${subject}`,
          adapter: {
            async getUserByIdentity() {
              return null;
            },
            async getOrganizationAccess() {
              return {
                organizationId: null,
                membershipIds: [],
                roleKeys: [],
                permissions: [],
              };
            },
          },
        }),
      (error) => error instanceof ApiAuthError && error.code === "OAUTH_SESSION_INVALID",
    );
  });

  it("rejects restricted linked users (account suspension fails closed)", async () => {
    await assert.rejects(
      () =>
        resolveLinkedMcpSession({
          session: {
            accessToken: "token",
            clientId: "example-mcp-client",
            scopes: ["organization:read"],
            userId: "external-user-123",
          },
          provider: "convex-auth",
          issuer: "https://auth.example.com",
          buildTokenIdentifier: (subject, issuer) => `${issuer}|${subject}`,
          adapter: {
            async getUserByIdentity() {
              return {
                userId: "user_123",
                identityId: "identity_123",
                activeOrganizationId: "org_123",
                membershipIds: ["membership_123"],
                roleKeys: ["member"],
                permissions: [],
                isRestricted: true,
                restrictedReason: "account_suspended",
              };
            },
            async getOrganizationAccess() {
              return {
                organizationId: "org_123",
                membershipIds: ["membership_123"],
                roleKeys: ["member"],
                permissions: ["organization:view"],
              };
            },
          },
        }),
      (error) => error instanceof ApiAuthError && error.code === "PRINCIPAL_RESTRICTED",
    );
  });

  it("rejects unlinked users", async () => {
    await assert.rejects(
      () =>
        resolveLinkedMcpSession({
          session: {
            accessToken: "token",
            clientId: "example-mcp-client",
            scopes: ["organization:read"],
            userId: "external-user-123",
          },
          provider: "convex-auth",
          issuer: "https://auth.example.com",
          buildTokenIdentifier: (subject, issuer) => `${issuer}|${subject}`,
          adapter: {
            async getUserByIdentity() {
              return null;
            },
            async getOrganizationAccess() {
              return {
                organizationId: null,
                membershipIds: [],
                roleKeys: [],
                permissions: [],
              };
            },
          },
        }),
      (error) => error instanceof ApiAuthError && error.code === "USER_IDENTITY_NOT_LINKED",
    );
  });
});
