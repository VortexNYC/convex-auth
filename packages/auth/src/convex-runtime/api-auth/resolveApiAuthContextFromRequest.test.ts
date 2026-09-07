import assert from "node:assert/strict";

import { describe, it } from "vitest";

import type { VerifiedUserToken } from "../coreTypes";
import {
  parseApiCredentialFromHeaders,
  resolveApiAuthContextFromRequest,
} from "./resolveApiAuthContextFromRequest";
import type { ApiAuthLookupAdapter, ApiTokenVerifier } from "./types";

function createVerifier(): ApiTokenVerifier {
  return {
    async verifyUserBearerToken(): Promise<VerifiedUserToken> {
      return {
        credentialType: "userBearer",
        provider: "convex-auth",
        issuer: "https://auth.example.com",
        subject: "user_123",
        tokenIdentifier: "https://auth.example.com|user_123",
        sessionId: "session_123",
        scopes: ["app:organization:read"],
        audience: "example-api",
        rawClaims: {},
      };
    },
  };
}

function createAdapter(): ApiAuthLookupAdapter {
  return {
    async getUserByIdentity() {
      return {
        userId: "user_123",
        identityId: "identity_123",
        activeOrganizationId: "org_123",
        membershipIds: ["membership_123"],
        roleKeys: ["owner"],
        permissions: ["organization:view"],
        isRestricted: false,
        restrictedReason: null,
      };
    },
    async getOrganizationAccess() {
      return {
        organizationId: "org_123",
        membershipIds: ["membership_123"],
        roleKeys: ["owner"],
        permissions: ["organization:view", "people:view"],
      };
    },
  };
}

describe("parseApiCredentialFromHeaders", () => {
  it("reads bearer and x-api-key credentials from request headers", () => {
    assert.deepEqual(
      parseApiCredentialFromHeaders({
        headers: new Headers({ Authorization: "Bearer session.jwt" }),
        apiKeyTokenPrefixes: ["app_live_"],
      }),
      { credentialType: "userBearer", token: "session.jwt" },
    );

    assert.deepEqual(
      parseApiCredentialFromHeaders({
        headers: new Headers({ "X-API-Key": "app_live_123.secret" }),
        apiKeyTokenPrefixes: ["app_live_"],
      }),
      { credentialType: "apiKeyBearer", token: "app_live_123.secret" },
    );
  });
});

describe("resolveApiAuthContextFromRequest", () => {
  it("parses headers, extracts request IP, and resolves package auth context", async () => {
    const context = await resolveApiAuthContextFromRequest({
      request: {
        headers: new Headers({
          Authorization: "Bearer session.jwt",
          "x-forwarded-for": "203.0.113.10, 10.0.0.1",
        }),
      },
      apiKeyTokenPrefixes: ["app_live_"],
      adapter: createAdapter(),
      resourceId: "GET /api/proof",
      resourceType: "http.route",
      verifier: createVerifier(),
    });

    assert.equal(context.credentialType, "userBearer");
    assert.equal(context.userId, "user_123");
    assert.equal(context.organizationId, "org_123");
    assert.deepEqual(context.permissions, ["organization:view", "people:view"]);
    assert.deepEqual(context.scopes, ["app:organization:read"]);
    assert.deepEqual(context.execution, {
      organizationId: "org_123",
      resourceType: "http.route",
      resourceId: "GET /api/proof",
      audience: "example-api",
      scopes: ["app:organization:read"],
    });
  });
});
