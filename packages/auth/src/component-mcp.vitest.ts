import assert from "node:assert/strict";

import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { describe, it } from "vitest";

import schema from "./component/schema";
import { MCP_OAUTH_RETIRED_SIGNING_KEY_RETENTION_MS } from "./mcp";

const modules = {
  "./component/_generated/api.ts": () => import("./component/_generated/api"),
  "./component/_generated/dataModel.ts": () => import("./component/_generated/dataModel"),
  "./component/_generated/server.ts": () => import("./component/_generated/server"),
  "./component/mcp.ts": () => import("./component/mcp"),
};

const createDynamicClient = makeFunctionReference<
  "mutation",
  {
    clientName: string;
    redirectUris: string[];
    scope?: string;
    softwareId?: string | null;
    softwareVersion?: string | null;
    clientIdPrefix?: string;
    supportedScopes: string[];
  },
  {
    clientId: string;
    clientIdIssuedAt: number;
    name: string;
    redirectUris: string[];
    allowedScopes: string[];
    tokenEndpointAuthMethod?: "none";
    pkceRequired?: boolean;
    grantTypes?: string[];
    responseTypes?: string[];
    softwareId: string | null;
    softwareVersion: string | null;
    registrationClientUri: string | null;
    registrationAccessToken: string | null;
  }
>("mcp:createDynamicClient");

const resolveClient = makeFunctionReference<
  "query",
  { clientId: string },
  null | {
    clientId: string;
    name: string;
    redirectUris: string[];
    allowedScopes: string[];
    tokenEndpointAuthMethod: "none";
    pkceRequired: boolean;
    grantTypes: string[];
    responseTypes: string[];
    softwareId: string | null;
    softwareVersion: string | null;
  }
>("mcp:resolveClient");

const createAuthorizationCode = makeFunctionReference<
  "mutation",
  {
    code: string;
    clientId: string;
    redirectUri: string;
    subjectId: string;
    organizationId: string;
    scopes: string[];
    codeChallenge: string;
    codeChallengeMethod: "S256";
    audience: string;
    resourceId: string;
    expiresAt: number;
  },
  { code: string }
>("mcp:createAuthorizationCode");

const consumeAuthorizationCode = makeFunctionReference<
  "mutation",
  { code: string; clientId: string; redirectUri: string },
  null | {
    clientId: string;
    subjectId: string;
    organizationId: string;
    scopes: string[];
    codeChallenge: string;
    codeChallengeMethod: "S256";
    audience: string;
    resourceId: string;
  }
>("mcp:consumeAuthorizationCode");

const issueRefreshToken = makeFunctionReference<
  "mutation",
  {
    clientId: string;
    subjectId: string;
    organizationId: string;
    scopes: string[];
    audience: string;
    resourceId: string;
  },
  {
    refreshToken: string;
    expiresAt: number;
    inactivityExpiresAt: number | null;
  }
>("mcp:issueRefreshToken");

const redeemRefreshToken = makeFunctionReference<
  "mutation",
  {
    client: {
      clientId: string;
      name: string;
      redirectUris: string[];
      allowedScopes: string[];
      tokenEndpointAuthMethod?: "none";
      pkceRequired?: boolean;
      grantTypes?: string[];
      responseTypes?: string[];
      softwareId?: string | null;
      softwareVersion?: string | null;
    };
    refreshToken: string;
    requestedScopes?: string[];
  },
  | {
      ok: true;
      subjectId: string;
      organizationId: string;
      audience: string;
      resourceId: string;
      scopes: string[];
      refreshToken: string;
      expiresAt: number;
      inactivityExpiresAt: number | null;
    }
  | {
      ok: false;
      status: number;
      body: { error: string; error_description?: string };
      reason: string;
    }
>("mcp:redeemRefreshToken");

type ListedSigningKey = {
  keyId: string;
  algorithm: "ES256";
  publicJwkJson: string;
  privateJwkJson: string;
  status: "active" | "retired";
  retiredAt: number | null;
  updatedAt: number;
};

const listSigningKeys = makeFunctionReference<
  "query",
  { includeRetired?: boolean },
  ListedSigningKey[]
>("mcp:listSigningKeys");

describe("component mcp oauth state", () => {
  it("creates stored clients and exchanges authorization and refresh tokens", async () => {
    const t = convexTest(schema, modules);
    const supportedScopes = ["organization:read", "tasks:read"];

    const client = await t.mutation(createDynamicClient, {
      clientName: "CLI Client",
      redirectUris: ["https://example.com/callback"],
      scope: supportedScopes.join(" "),
      softwareId: null,
      softwareVersion: null,
      clientIdPrefix: "test-mcp",
      supportedScopes,
    });

    assert.equal(client.name, "CLI Client");
    assert.deepEqual(client.allowedScopes, supportedScopes);
    assert.equal(client.softwareId, null);
    assert.equal(client.softwareVersion, null);

    const resolvedClient = await t.query(resolveClient, {
      clientId: client.clientId,
    });
    assert.equal(resolvedClient?.clientId, client.clientId);

    await t.mutation(createAuthorizationCode, {
      code: "auth-code-1",
      clientId: client.clientId,
      redirectUri: "https://example.com/callback",
      subjectId: "ba_user_123",
      organizationId: "org_123",
      scopes: supportedScopes,
      codeChallenge: "challenge",
      codeChallengeMethod: "S256",
      audience: "https://api.example.com",
      resourceId: "example-mcp",
      expiresAt: Date.now() + 60_000,
    });

    const authorizationCode = await t.mutation(consumeAuthorizationCode, {
      code: "auth-code-1",
      clientId: client.clientId,
      redirectUri: "https://example.com/callback",
    });
    assert.equal(authorizationCode?.organizationId, "org_123");
    assert.deepEqual(authorizationCode?.scopes, supportedScopes);

    const replayedAuthorizationCode = await t.mutation(consumeAuthorizationCode, {
      code: "auth-code-1",
      clientId: client.clientId,
      redirectUri: "https://example.com/callback",
    });
    assert.equal(replayedAuthorizationCode, null);

    const issuedRefreshToken = await t.mutation(issueRefreshToken, {
      clientId: client.clientId,
      subjectId: "ba_user_123",
      organizationId: "org_123",
      scopes: supportedScopes,
      audience: "https://api.example.com",
      resourceId: "example-mcp",
    });
    assert.equal(typeof issuedRefreshToken.refreshToken, "string");

    const redeemedRefreshToken = await t.mutation(redeemRefreshToken, {
      client: {
        clientId: client.clientId,
        name: client.name,
        redirectUris: [...client.redirectUris],
        allowedScopes: [...client.allowedScopes],
        tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
        pkceRequired: client.pkceRequired,
        grantTypes: client.grantTypes ? [...client.grantTypes] : undefined,
        responseTypes: client.responseTypes ? [...client.responseTypes] : undefined,
        softwareId: client.softwareId,
        softwareVersion: client.softwareVersion,
      },
      refreshToken: issuedRefreshToken.refreshToken,
      requestedScopes: ["organization:read"],
    });

    assert.equal(redeemedRefreshToken.ok, true);
    if (!redeemedRefreshToken.ok) {
      throw new Error("expected refresh redemption success");
    }
    assert.equal(redeemedRefreshToken.organizationId, "org_123");
    assert.deepEqual(redeemedRefreshToken.scopes, ["organization:read"]);

    const replayedRefreshToken = await t.mutation(redeemRefreshToken, {
      client: {
        clientId: client.clientId,
        name: client.name,
        redirectUris: [...client.redirectUris],
        allowedScopes: [...client.allowedScopes],
        tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
        pkceRequired: client.pkceRequired,
        grantTypes: client.grantTypes ? [...client.grantTypes] : undefined,
        responseTypes: client.responseTypes ? [...client.responseTypes] : undefined,
        softwareId: client.softwareId,
        softwareVersion: client.softwareVersion,
      },
      refreshToken: issuedRefreshToken.refreshToken,
    });

    assert.equal(replayedRefreshToken.ok, false);

    const descendantAfterReplay = await t.mutation(redeemRefreshToken, {
      client: {
        clientId: client.clientId,
        name: client.name,
        redirectUris: [...client.redirectUris],
        allowedScopes: [...client.allowedScopes],
        tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
        pkceRequired: client.pkceRequired,
        grantTypes: client.grantTypes ? [...client.grantTypes] : undefined,
        responseTypes: client.responseTypes ? [...client.responseTypes] : undefined,
        softwareId: client.softwareId,
        softwareVersion: client.softwareVersion,
      },
      refreshToken: redeemedRefreshToken.refreshToken,
    });
    assert.equal(descendantAfterReplay.ok, false);
  });

  it("lists the active and still-retained signing keys without app-only pagination", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("mcp_oauth_signing_keys", {
        keyId: "active",
        algorithm: "ES256",
        publicJwkJson: "{}",
        privateJwkJson: "{}",
        status: "active",
        createdAt: now - 3_000,
        updatedAt: now - 1_000,
      });
      await ctx.db.insert("mcp_oauth_signing_keys", {
        keyId: "retained",
        algorithm: "ES256",
        publicJwkJson: "{}",
        privateJwkJson: "{}",
        status: "retired",
        retiredAt: now - 2_000,
        createdAt: now - 4_000,
        updatedAt: now - 2_000,
      });
      await ctx.db.insert("mcp_oauth_signing_keys", {
        keyId: "expired",
        algorithm: "ES256",
        publicJwkJson: "{}",
        privateJwkJson: "{}",
        status: "retired",
        retiredAt: now - MCP_OAUTH_RETIRED_SIGNING_KEY_RETENTION_MS - 1_000,
        createdAt: now - MCP_OAUTH_RETIRED_SIGNING_KEY_RETENTION_MS - 2_000,
        /**
         * A delayed replay can update an already-expired retirement record. Its
         * canonical retiredAt, not this fresh write time, controls trust.
         */
        updatedAt: now,
      });
    });

    const activeOnly = await t.query(listSigningKeys, {});
    assert.deepEqual(
      activeOnly.map((key) => key.keyId),
      ["active"],
    );

    const retained = await t.query(listSigningKeys, {
      includeRetired: true,
    });
    assert.deepEqual(retained.map((key) => key.keyId).toSorted(), ["active", "retained"]);
  });

  it("fails loudly instead of silently truncating an invalid signing-key set", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    await t.run(async (ctx) => {
      for (let index = 0; index < 257; index += 1) {
        await ctx.db.insert("mcp_oauth_signing_keys", {
          keyId: `active-${index}`,
          algorithm: "ES256",
          publicJwkJson: "{}",
          privateJwkJson: "{}",
          status: "active",
          createdAt: now + index,
          updatedAt: now + index,
        });
      }
    });

    await assert.rejects(
      t.query(listSigningKeys, {}),
      /retained MCP OAuth signing-key set exceeds the supported bound/,
    );
  });
});
