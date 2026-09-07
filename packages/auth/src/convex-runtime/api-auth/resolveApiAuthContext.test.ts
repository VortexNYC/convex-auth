import assert from "node:assert/strict";

import { describe, it } from "vitest";

import type { VerifiedUserToken } from "../coreTypes";
import { ApiAuthError } from "./errors";
import { resolveApiAuthContext } from "./resolveApiAuthContext";
import type { ApiAuthLookupAdapter, ApiTokenVerifier } from "./types";

function createVerifiedUserToken(): VerifiedUserToken {
  return {
    credentialType: "userBearer",
    provider: "convex-auth",
    issuer: "https://auth.example.com",
    subject: "user_subject_123",
    tokenIdentifier: "issuer|identity_123",
    sessionId: "session_123",
    scopes: ["profile:read"],
    audience: "example-api",
    rawClaims: {},
  };
}

function createVerifier(): ApiTokenVerifier {
  return {
    async verifyUserBearerToken(): Promise<VerifiedUserToken> {
      return createVerifiedUserToken();
    },
  };
}

function createUserAdapter(overrides?: Partial<ApiAuthLookupAdapter>): ApiAuthLookupAdapter {
  return {
    async getUserByIdentity() {
      return {
        userId: "user_123",
        identityId: "identity_123",
        activeOrganizationId: "org_123",
        membershipIds: ["membership_123"],
        roleKeys: ["owner"],
        permissions: ["org:read"],
        isRestricted: false,
        restrictedReason: null,
      };
    },
    async getOrganizationAccess() {
      return {
        organizationId: "org_123",
        membershipIds: ["membership_123"],
        roleKeys: ["owner"],
        permissions: ["org:read", "org:write"],
      };
    },
    ...overrides,
  };
}

describe("resolveApiAuthContext", () => {
  it("resolves linked user bearer token into package auth context", async () => {
    const context = await resolveApiAuthContext({
      credential: {
        credentialType: "userBearer",
        token: "user_token_123",
      },
      resourceType: "http.route",
      resourceId: "GET /v1/me",
      verifier: createVerifier(),
      adapter: createUserAdapter(),
    });

    assert.equal(context.credentialType, "userBearer");
    assert.equal(context.principal.kind, "user");
    assert.equal(context.userId, "user_123");
    assert.equal(context.organizationId, "org_123");
    assert.deepStrictEqual(context.permissions, ["org:read", "org:write"]);
    assert.deepStrictEqual(context.scopes, ["profile:read"]);
    assert.deepStrictEqual(context.execution, {
      organizationId: "org_123",
      resourceType: "http.route",
      resourceId: "GET /v1/me",
      audience: "example-api",
      scopes: ["profile:read"],
    });
  });

  it("throws when verified user identity is not linked locally", async () => {
    await assert.rejects(
      () =>
        resolveApiAuthContext({
          credential: {
            credentialType: "userBearer",
            token: "user_token_123",
          },
          verifier: createVerifier(),
          adapter: createUserAdapter({
            async getUserByIdentity() {
              return null;
            },
          }),
        }),
      (error: unknown) =>
        error instanceof ApiAuthError && error.code === "USER_IDENTITY_NOT_LINKED",
    );
  });

  it("normalizes verifier failures into API auth errors", async () => {
    await assert.rejects(
      () =>
        resolveApiAuthContext({
          credential: {
            credentialType: "userBearer",
            token: "invalid_user_token",
          },
          verifier: {
            async verifyUserBearerToken(): Promise<VerifiedUserToken> {
              throw new Error("JWTExpired");
            },
          },
          adapter: createUserAdapter(),
        }),
      (error: unknown) => error instanceof ApiAuthError && error.code === "API_CREDENTIAL_INVALID",
    );
  });

  it("throws when resolved user principal is restricted", async () => {
    await assert.rejects(
      () =>
        resolveApiAuthContext({
          credential: {
            credentialType: "userBearer",
            token: "user_token_123",
          },
          verifier: createVerifier(),
          adapter: createUserAdapter({
            async getUserByIdentity() {
              return {
                userId: "user_123",
                identityId: "identity_123",
                activeOrganizationId: "org_123",
                membershipIds: ["membership_123"],
                roleKeys: ["owner"],
                permissions: ["org:read"],
                isRestricted: true,
                restrictedReason: "manual_hold",
              };
            },
          }),
        }),
      (error: unknown) => error instanceof ApiAuthError && error.code === "PRINCIPAL_RESTRICTED",
    );
  });

  it("resolves explicit api key bearer credentials when adapter supports them", async () => {
    const context = await resolveApiAuthContext({
      credential: {
        credentialType: "apiKeyBearer",
        token: "vk_test_123",
      },
      requestIp: "127.0.0.1",
      verifier: createVerifier(),
      adapter: createUserAdapter({
        async getApiKeyPrincipal() {
          return {
            principal: {
              kind: "apiKey",
              apiKeyId: "key_123",
              ownerType: "organization",
              ownerId: "org_123",
              organizationId: "org_123",
              inheritedPermissions: ["org:read", "org:write"],
              narrowedPermissions: ["org:read"],
              effectivePermissions: ["org:read"],
              isRestricted: false,
              restrictedReason: null,
            },
            userId: null,
            organizationId: "org_123",
            permissions: ["org:read"],
            scopes: ["payments:read"],
          };
        },
      }),
    });

    assert.equal(context.credentialType, "apiKeyBearer");
    assert.equal(context.principal.kind, "apiKey");
    assert.equal(context.userId, null);
    assert.equal(context.organizationId, "org_123");
    assert.deepStrictEqual(context.permissions, ["org:read"]);
    assert.deepStrictEqual(context.scopes, ["payments:read"]);
  });

  it("throws when api key support is not configured", async () => {
    await assert.rejects(
      () =>
        resolveApiAuthContext({
          credential: {
            credentialType: "apiKeyBearer",
            token: "vk_test_123",
          },
          verifier: createVerifier(),
          adapter: createUserAdapter(),
        }),
      (error: unknown) =>
        error instanceof ApiAuthError && error.code === "API_CREDENTIAL_UNSUPPORTED",
    );
  });
});
