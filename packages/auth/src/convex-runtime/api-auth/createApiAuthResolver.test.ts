import assert from "node:assert/strict";

import { hasPermission, permissionMatcherConformanceCases } from "convex-auth-core";
import { describe, it } from "vitest";

import type { VerifiedUserToken } from "../coreTypes";
import { createApiAuthResolver, type ResolvedApiAuthScopeContext } from "./createApiAuthResolver";
import { ApiAuthError } from "./errors";
import type { McpSessionLike } from "./resolveMcpSessionAuthContext";

// ---------------------------------------------------------------------------
// Proof matrix for the scope-ceiling invariant.
//
// THE invariant (Increment 2): a consumer must be UNABLE to author a permissive
// scope ceiling. api_key/oauth principals MUST NEVER bypass their scope set via
// role, and the live-membership permission ceiling MUST always also apply. Only
// jwt (session) principals may get role-based full access. This is baked into
// the package-owned resolver — never a per-call-site or per-consumer argument.
//
// Each case below drives the resolver end-to-end through fakes and asserts the
// fail-closed (or, for the one intended-allow case, fail-open) behavior.
// ---------------------------------------------------------------------------

type TestScope = "reports:read" | "reports:write" | "billing:read";

const ALL_SCOPES: TestScope[] = ["reports:read", "reports:write", "billing:read"];

type TestCtx = { marker: "test-ctx" };
const ctx: TestCtx = { marker: "test-ctx" };

// canUseScope models live permissions as the explicit list of scopes the
// owner's CURRENT membership may exercise. permission name === scope name.
function canUseScope(permissions: readonly string[], scope: TestScope): boolean {
  return hasPermission(permissions, scope);
}

function buildVerifiedUserToken(overrides: Partial<VerifiedUserToken> = {}): VerifiedUserToken {
  return {
    credentialType: "userBearer",
    provider: "convex",
    issuer: "https://issuer.test",
    subject: "external-user-1",
    tokenIdentifier: "https://issuer.test|external-user-1",
    sessionId: "session-1",
    scopes: [],
    audience: null,
    rawClaims: {},
    ...overrides,
  };
}

type ResolverOverrides = {
  // live membership ceiling returned by authorizeOrganizationAccess
  liveRole?: string;
  livePermissions?: string[];
  liveAccessDenied?: boolean;
  // jwt path
  jwtScopes?: string[];
  // api key path
  apiKeyScopes?: string[];
  // mcp path
  mcpScopes?: string[];
  // suspended/restricted linked user
  restricted?: boolean;
  // policy knob (jwt-only). intentionally NO token override exists.
  sessionFullAccessRoles?: readonly string[];
};

function makeResolver(overrides: ResolverOverrides = {}) {
  const livePermissions = overrides.livePermissions ?? [];
  const liveRole = overrides.liveRole ?? "member";

  const verifier = {
    async verifyUserBearerToken(): Promise<VerifiedUserToken> {
      return buildVerifiedUserToken({ scopes: overrides.jwtScopes ?? [] });
    },
  };

  const adapter = {
    async getUserByIdentity() {
      return {
        userId: "user-1",
        identityId: "identity-1",
        activeOrganizationId: "org-1",
        membershipIds: ["membership-1"],
        roleKeys: [liveRole],
        permissions: livePermissions,
        isRestricted: overrides.restricted ?? false,
        restrictedReason: overrides.restricted === true ? "account_suspended" : null,
      };
    },
    async getOrganizationAccess() {
      return {
        organizationId: "org-1",
        membershipIds: ["membership-1"],
        roleKeys: [liveRole],
        permissions: livePermissions,
      };
    },
  };

  return createApiAuthResolver<TestCtx, TestScope, string>({
    getVerifier: () => verifier,
    createAdapter: () => adapter,
    canUseScope,
    parseUserId: (value) => value,
    parseOrganizationId: (value) => value,
    sessionFullAccessRoles: overrides.sessionFullAccessRoles,
    authorizeOrganizationAccess: async () =>
      overrides.liveAccessDenied === true ? null : { role: liveRole, permissions: livePermissions },
    resourceType: "http.route",
    resourceId: "test:api",
    apiKey: {
      tokenPrefixes: ["vatest_"],
      resolveRecord: async () => ({
        apiKeyId: "apikey-1",
        ownerUserId: "user-1",
        organizationId: "org-1",
        scopes: overrides.apiKeyScopes ?? [],
        requestIp: null,
      }),
    },
    mcp: {
      provider: "convex",
      getIssuer: () => "https://issuer.test",
      buildTokenIdentifier: (subject, issuer) => `${issuer}|${subject}`,
      audience: "test-mcp",
      resourceType: "mcp.tool",
      resourceId: "test:mcp",
    },
  });
}

function apiKeyRequest(token = "vatest_secret"): Request {
  return new Request("https://app.test/api", {
    headers: { "X-API-Key": token },
  });
}

function jwtRequest(token = "eyJ.jwt.token"): Request {
  return new Request("https://app.test/api", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

function mcpSession(scopes: string[]): McpSessionLike {
  return {
    clientId: "mcp-client-1",
    userId: "external-user-1",
    scopes,
    accessToken: "mcp-access-token",
  };
}

async function expectThrowsApiAuth(fn: () => unknown): Promise<ApiAuthError> {
  try {
    await fn();
  } catch (error) {
    assert.ok(error instanceof ApiAuthError, `expected ApiAuthError, got ${String(error)}`);
    return error;
  }
  throw new assert.AssertionError({
    message: "expected the call to throw, but it resolved",
  });
}

describe("createApiAuthResolver — scope-ceiling proof matrix", () => {
  for (const testCase of permissionMatcherConformanceCases) {
    it(`permission conformance: ${testCase.name}`, async () => {
      const resolver = makeResolver({
        liveRole: "member",
        livePermissions: [...testCase.granted],
      });
      const auth = await resolver.resolveApiAuth(ctx, jwtRequest());
      assert.equal(auth.hasPermission(testCase.required), testCase.expected);
    });
  }

  it("owner-exceeds-scope: api_key owner CANNOT bypass the token scope set (the owner-exceeds-scope bug)", async () => {
    // Owner role + the owner's role is in sessionFullAccessRoles, but it's an
    // api_key principal whose scope set lacks reports:write.
    const resolver = makeResolver({
      liveRole: "owner",
      livePermissions: [...ALL_SCOPES],
      apiKeyScopes: ["reports:read"],
      sessionFullAccessRoles: ["owner", "admin"],
    });
    const auth = await resolver.resolveApiAuth(ctx, apiKeyRequest());

    assert.equal(auth.authType, "api_key");
    assert.equal(auth.role, "owner");
    // reports:read is in scope + permitted → allowed
    resolver.requireScope(auth, "reports:read");
    // reports:write is NOT in the key's scope set → owner does NOT bypass
    await expectThrowsApiAuth(() => resolver.requireScope(auth, "reports:write"));
  });

  it("session-role-bypass: jwt owner WITH no explicit scope IS allowed (intended)", async () => {
    const resolver = makeResolver({
      liveRole: "owner",
      livePermissions: [],
      jwtScopes: [],
    });
    const auth = await resolver.resolveApiAuth(ctx, jwtRequest());

    assert.equal(auth.authType, "jwt");
    // jwt + owner → role-based full access, even with no scope and no permission
    resolver.requireScope(auth, "reports:read");
    resolver.requireScope(auth, "billing:read");
  });

  it("token-with-scope-but-no-permission: scope present but live permission absent → THROWS", async () => {
    const resolver = makeResolver({
      liveRole: "member",
      livePermissions: [], // owner's live membership grants nothing
      apiKeyScopes: ["reports:read"], // key claims the scope
    });
    const auth = await resolver.resolveApiAuth(ctx, apiKeyRequest());

    // scope ∩ permission: both required. Permission missing → deny.
    await expectThrowsApiAuth(() => resolver.requireScope(auth, "reports:read"));
  });

  it("token-without-scope: key lacks the scope → THROWS regardless of permissions", async () => {
    const resolver = makeResolver({
      liveRole: "member",
      livePermissions: ["reports:read"], // permitted by membership...
      apiKeyScopes: [], // ...but the key was never granted the scope
    });
    const auth = await resolver.resolveApiAuth(ctx, apiKeyRequest());

    await expectThrowsApiAuth(() => resolver.requireScope(auth, "reports:read"));
  });

  it("stale-token: owner lost the permission after issuance → live lookup THROWS", async () => {
    // Key still carries the scope, but the live-membership ceiling no longer
    // grants the permission (revoked after issuance).
    const resolver = makeResolver({
      liveRole: "member",
      livePermissions: [], // revoked
      apiKeyScopes: ["reports:read"],
    });
    const auth = await resolver.resolveApiAuth(ctx, apiKeyRequest());

    await expectThrowsApiAuth(() => resolver.requireScope(auth, "reports:read"));
  });

  it("consumer-cannot-widen: no sessionFullAccessRoles value lets an api_key bypass its scope set", async () => {
    // Even if the consumer puts the owner's role in sessionFullAccessRoles, that
    // policy applies to jwt ONLY. api_key/oauth always get [] full-access roles.
    const resolver = makeResolver({
      liveRole: "superuser",
      livePermissions: [...ALL_SCOPES],
      apiKeyScopes: ["reports:read"],
      sessionFullAccessRoles: ["owner", "admin", "superuser"],
    });
    const auth = await resolver.resolveApiAuth(ctx, apiKeyRequest());

    // superuser is "full access" for sessions, but this is an api_key →
    // the scope set is the hard ceiling.
    await expectThrowsApiAuth(() => resolver.requireScope(auth, "billing:read"));
    await expectThrowsApiAuth(() => resolver.requireScope(auth, "reports:write"));
  });

  it("oauth/mcp owner-exceeds-scope: mcp session owner CANNOT bypass the token scope set", async () => {
    const resolver = makeResolver({
      liveRole: "owner",
      livePermissions: [...ALL_SCOPES],
      mcpScopes: ["reports:read"],
      sessionFullAccessRoles: ["owner", "admin"],
    });
    const auth = await resolver.resolveMcpAuth(ctx, {
      session: mcpSession(["reports:read"]),
    });

    assert.equal(auth.authType, "oauth");
    resolver.requireScope(auth, "reports:read");
    await expectThrowsApiAuth(() => resolver.requireScope(auth, "reports:write"));
  });

  it("restricted user via MCP fails closed (no account-suspension bypass)", async () => {
    // A suspended user must not authorize through the MCP path just because org
    // access + scopes still pass — parity with the JWT bearer path.
    const resolver = makeResolver({
      liveRole: "owner",
      livePermissions: [...ALL_SCOPES],
      mcpScopes: ["reports:read"],
      restricted: true,
    });
    const error = await expectThrowsApiAuth(() =>
      resolver.resolveMcpAuth(ctx, { session: mcpSession(["reports:read"]) }),
    );
    assert.equal(error.code, "PRINCIPAL_RESTRICTED");
  });

  it("happy path: api_key with scope AND live permission is allowed", async () => {
    const resolver = makeResolver({
      liveRole: "member",
      livePermissions: ["reports:read"],
      apiKeyScopes: ["reports:read"],
    });
    const auth = await resolver.resolveApiAuth(ctx, apiKeyRequest());

    resolver.requireScope(auth, "reports:read");
    assert.equal(auth.hasScope("reports:read"), true);
    assert.equal(auth.hasScope("reports:write"), false);
    assert.equal(auth.hasPermission("reports:read"), true);
  });

  it("denied org access surfaces as an ApiAuthError (fail-closed)", async () => {
    const resolver = makeResolver({
      liveAccessDenied: true,
      apiKeyScopes: ["reports:read"],
    });
    await expectThrowsApiAuth(() => resolver.resolveApiAuth(ctx, apiKeyRequest()));
  });

  it("type-level: ResolvedApiAuthScopeContext carries the baked surface", () => {
    // Compile-time guard: the resolved context exposes role/permissions/scopes
    // and the scope-typed helpers. If this drifts, the test stops compiling.
    const shape: Pick<
      ResolvedApiAuthScopeContext<TestScope, string>,
      "authType" | "hasScope" | "hasPermission"
    > = {
      authType: "api_key",
      hasScope: () => false,
      hasPermission: () => false,
    };
    assert.equal(shape.authType, "api_key");
  });
});
