import assert from "node:assert/strict";

import { hasPermission } from "../../core";
import { describe, it } from "vitest";

import { resolveApiScopeAuthorization } from "./scopeAuthorization";

describe("resolveApiScopeAuthorization", () => {
  it("requires API key scopes for API key auth", () => {
    assert.deepEqual(
      resolveApiScopeAuthorization({
        authType: "api_key",
        scopes: [],
        role: "owner",
        permissions: ["*"],
        requiredScope: "app:organization:read",
        canUserUseScope: () => true,
      }),
      { allowed: false, reason: "missing_api_key_scope" },
    );
  });

  it("requires OAuth scopes and owner permissions for OAuth auth", () => {
    assert.deepEqual(
      resolveApiScopeAuthorization({
        authType: "oauth",
        scopes: [],
        role: "owner",
        permissions: ["*"],
        requiredScope: "app:organization:read",
        canUserUseScope: () => true,
      }),
      { allowed: false, reason: "missing_api_key_scope" },
    );

    assert.deepEqual(
      resolveApiScopeAuthorization({
        authType: "oauth",
        scopes: ["app:organization:read"],
        role: "owner",
        permissions: [],
        requiredScope: "app:organization:read",
        canUserUseScope: () => false,
      }),
      { allowed: false, reason: "missing_user_permission" },
    );

    assert.deepEqual(
      resolveApiScopeAuthorization({
        authType: "oauth",
        scopes: ["app:organization:read"],
        role: "owner",
        permissions: ["organization:view"],
        requiredScope: "app:organization:read",
        canUserUseScope: (permissions, scope) =>
          scope === "app:organization:read" && hasPermission(permissions, "organization:view"),
      }),
      { allowed: true },
    );
  });

  it("requires owner permissions for API key auth even when the owner role is privileged", () => {
    assert.deepEqual(
      resolveApiScopeAuthorization({
        authType: "api_key",
        scopes: ["app:organization:read"],
        role: "owner",
        permissions: [],
        requiredScope: "app:organization:read",
        canUserUseScope: () => false,
      }),
      { allowed: false, reason: "missing_user_permission" },
    );

    assert.deepEqual(
      resolveApiScopeAuthorization({
        authType: "api_key",
        scopes: ["app:organization:read"],
        role: "owner",
        permissions: ["organization:view"],
        requiredScope: "app:organization:read",
        canUserUseScope: (permissions, scope) =>
          scope === "app:organization:read" && hasPermission(permissions, "organization:view"),
      }),
      { allowed: true },
    );
  });

  it("allows first-party JWT owners and admins through the role shortcut", () => {
    assert.deepEqual(
      resolveApiScopeAuthorization({
        authType: "jwt",
        scopes: [],
        role: "admin",
        permissions: [],
        requiredScope: "app:organization:read",
        canUserUseScope: () => false,
      }),
      { allowed: true },
    );
  });

  it("requires mapped user permissions for non-admin JWT auth", () => {
    assert.deepEqual(
      resolveApiScopeAuthorization({
        authType: "jwt",
        scopes: [],
        role: "member",
        permissions: ["organization:view"],
        requiredScope: "app:organization:read",
        canUserUseScope: (permissions, scope) =>
          scope === "app:organization:read" && hasPermission(permissions, "organization:view"),
      }),
      { allowed: true },
    );

    assert.deepEqual(
      resolveApiScopeAuthorization({
        authType: "jwt",
        scopes: [],
        role: "member",
        permissions: [],
        requiredScope: "app:organization:read",
        canUserUseScope: () => false,
      }),
      { allowed: false, reason: "missing_user_permission" },
    );
  });
});
