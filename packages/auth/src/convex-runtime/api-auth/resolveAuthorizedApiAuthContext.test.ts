import assert from "node:assert/strict";

import { describe, it } from "vitest";

import type { ApiResolvedAuthContext } from "../coreTypes";
import { resolveAuthorizedApiAuthContext } from "./resolveAuthorizedApiAuthContext";

const baseAuth: ApiResolvedAuthContext = {
  credentialType: "userBearer",
  principal: {
    kind: "user",
    userId: "user_1",
    identityId: "identity_1",
    activeOrganizationId: "org_1",
    membershipIds: ["membership_1"],
    roleKeys: ["member"],
    permissions: [],
    sessionId: null,
    isRestricted: false,
    restrictedReason: null,
  },
  execution: {
    organizationId: "org_1",
    resourceType: null,
    resourceId: null,
    audience: null,
    scopes: ["app:organization:read"],
  },
  userId: "user_1",
  organizationId: "org_1",
  permissions: [],
  scopes: ["app:organization:read"],
};

describe("resolveAuthorizedApiAuthContext", () => {
  it("returns shared authorized api auth context", async () => {
    const resolved = await resolveAuthorizedApiAuthContext({
      auth: baseAuth,
      authType: "jwt",
      authSubject: "external-user-1",
      authorizeOrganizationAccess: async () => ({
        role: "owner",
        permissions: ["organization:view"],
      }),
    });

    assert.deepEqual(resolved, {
      auth: baseAuth,
      authType: "jwt",
      authSubject: "external-user-1",
      scopes: ["app:organization:read"],
      userId: "user_1",
      organizationId: "org_1",
      role: "owner",
      permissions: ["organization:view"],
    });
  });

  it("returns null when authorization denies access", async () => {
    const resolved = await resolveAuthorizedApiAuthContext({
      auth: baseAuth,
      authType: "oauth",
      authSubject: "external-user-1",
      authorizeOrganizationAccess: async () => null,
    });

    assert.equal(resolved, null);
  });
});
