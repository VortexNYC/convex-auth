import assert from "node:assert/strict";

import { describe, it } from "vitest";

import type { VerifiedUserToken } from "../coreTypes";
import { ApiAuthError } from "./errors";
import { resolveVerifiedUserBearerAuthContext } from "./resolveVerifiedUserBearerAuthContext";
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

function createAdapter(overrides?: Partial<ApiAuthLookupAdapter>): ApiAuthLookupAdapter {
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

describe("resolveVerifiedUserBearerAuthContext", () => {
  it("returns both verified token and resolved auth context", async () => {
    const resolved = await resolveVerifiedUserBearerAuthContext({
      token: "user_token_123",
      verifier: createVerifier(),
      adapter: createAdapter(),
      resourceType: "http.route",
      resourceId: "GET /v1/me",
    });

    assert.equal(resolved.verifiedToken.subject, "user_subject_123");
    assert.equal(resolved.context.credentialType, "userBearer");
    assert.equal(resolved.context.principal.kind, "user");
    assert.equal(resolved.context.userId, "user_123");
    assert.equal(resolved.context.organizationId, "org_123");
    assert.deepEqual(resolved.context.scopes, ["profile:read"]);
  });

  it("normalizes verifier failures into API auth errors", async () => {
    await assert.rejects(
      () =>
        resolveVerifiedUserBearerAuthContext({
          token: "bad_token",
          verifier: {
            async verifyUserBearerToken(): Promise<VerifiedUserToken> {
              throw new Error("JWTExpired");
            },
          },
          adapter: createAdapter(),
        }),
      (error: unknown) => error instanceof ApiAuthError && error.code === "API_CREDENTIAL_INVALID",
    );
  });
});
