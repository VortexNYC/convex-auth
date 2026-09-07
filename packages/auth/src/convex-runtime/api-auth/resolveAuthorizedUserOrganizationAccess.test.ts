import assert from "node:assert/strict";

import { describe, it } from "vitest";

import type { ApiResolvedAuthContext } from "../coreTypes";
import { ApiAuthError } from "./errors";
import { resolveAuthorizedUserOrganizationAccess } from "./resolveAuthorizedUserOrganizationAccess";

function createResolvedAuthContext(): ApiResolvedAuthContext {
  return {
    credentialType: "userBearer",
    principal: {
      kind: "user",
      userId: "user_123",
      identityId: "identity_123",
      activeOrganizationId: "org_123",
      membershipIds: ["membership_123"],
      roleKeys: ["member"],
      permissions: ["org:read"],
      sessionId: "session_123",
      isRestricted: false,
      restrictedReason: null,
    },
    execution: {
      organizationId: "org_123",
      resourceType: "http.route",
      resourceId: "GET /v1/me",
      audience: "example-api",
      scopes: ["organization:read"],
    },
    userId: "user_123",
    organizationId: "org_123",
    permissions: ["org:read"],
    scopes: ["organization:read"],
  };
}

describe("resolveAuthorizedUserOrganizationAccess", () => {
  it("resolves authorized user organization access", async () => {
    const resolved = await resolveAuthorizedUserOrganizationAccess({
      auth: createResolvedAuthContext(),
      authorizeOrganizationAccess: async ({ userId, organizationId }) => {
        assert.equal(userId, "user_123");
        assert.equal(organizationId, "org_123");
        return {
          role: "member",
          permissions: ["organization:view"],
        };
      },
    });

    assert.deepEqual(resolved, {
      userId: "user_123",
      organizationId: "org_123",
      role: "member",
      permissions: ["organization:view"],
      scopes: ["organization:read"],
    });
  });

  it("allows overriding the resolved auth user id", async () => {
    const resolved = await resolveAuthorizedUserOrganizationAccess({
      auth: {
        ...createResolvedAuthContext(),
        userId: null,
      },
      userId: "user_456",
      authorizeOrganizationAccess: async ({ userId }) => {
        assert.equal(userId, "user_456");
        return {
          role: "member",
          permissions: ["organization:view"],
        };
      },
    });

    assert.equal(resolved?.userId, "user_456");
  });

  it("returns null when consumer authorization denies access", async () => {
    const resolved = await resolveAuthorizedUserOrganizationAccess({
      auth: createResolvedAuthContext(),
      authorizeOrganizationAccess: async () => null,
    });

    assert.equal(resolved, null);
  });

  it("throws when resolved auth is missing user or organization", async () => {
    await assert.rejects(
      () =>
        resolveAuthorizedUserOrganizationAccess({
          auth: {
            ...createResolvedAuthContext(),
            userId: null,
          },
          authorizeOrganizationAccess: async () => ({
            role: "member",
            permissions: ["organization:view"],
          }),
        }),
      (error: unknown) => error instanceof ApiAuthError && error.code === "API_CREDENTIAL_INVALID",
    );
  });
});
