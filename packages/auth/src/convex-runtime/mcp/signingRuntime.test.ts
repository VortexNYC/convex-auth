import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { MCP_OAUTH_RETIRED_SIGNING_KEY_RETENTION_MS } from "./signing";
import {
  buildMcpOAuthPublicJwks,
  ensureMcpOAuthSigningKey,
  rotateMcpOAuthSigningKey,
  signMcpOAuthAccessTokenWithStoredKey,
  verifyMcpOAuthAccessTokenWithStoredKeys,
} from "./signingRuntime";
import type { McpOAuthSigningKeyRecord } from "./types";

type StoredKey = McpOAuthSigningKeyRecord & {
  status: "active" | "retired";
  retiredAt: number | null;
};

async function createStore() {
  const keys: StoredKey[] = [];

  return {
    keys,
    loadActiveSigningKey: () => keys.find((key) => key.status === "active") ?? null,
    listSigningKeys: () => keys,
    persistSigningKey: (signingKey: McpOAuthSigningKeyRecord) => {
      keys.push({
        ...signingKey,
        status: "active",
        retiredAt: null,
      });
    },
    retireSigningKey: ({ keyId, retiredAt }: { keyId: string; retiredAt: number }) => {
      const key = keys.find((candidate) => candidate.keyId === keyId);
      if (key) {
        key.status = "retired";
        key.retiredAt = retiredAt;
      }
    },
  };
}

describe("mcp oauth signing runtime helpers", () => {
  it("ensures and reuses one active signing key", async () => {
    const store = await createStore();

    const first = await ensureMcpOAuthSigningKey(store);
    const second = await ensureMcpOAuthSigningKey(store);

    assert.equal(store.keys.length, 1);
    assert.equal(first.keyId, second.keyId);
  });

  it("signs and verifies tokens through stored key callbacks", async () => {
    const store = await createStore();
    const issuer = "https://example.com/oauth/test";
    const audience = "test-audience";

    const signed = await signMcpOAuthAccessTokenWithStoredKey({
      ...store,
      issuer,
      audience,
      subject: "user_1",
      claims: {
        clientId: "client_1",
        subjectId: "external-user-1",
        resourceId: "app:mcp",
        scopes: ["app:organization:read"],
        organizationId: "org_1",
        organizationSlug: "acme",
      },
    });

    const verified = await verifyMcpOAuthAccessTokenWithStoredKeys({
      accessToken: signed.accessToken,
      issuer,
      audience,
      listSigningKeys: store.listSigningKeys,
    });

    assert.equal(verified.clientId, "client_1");
    assert.equal(verified.organizationId, "org_1");
    assert.equal(verified.organizationSlug, "acme");
  });

  it("builds public jwks and keeps retired keys within retention", async () => {
    const store = await createStore();
    const initial = await ensureMcpOAuthSigningKey(store);
    const rotated = await rotateMcpOAuthSigningKey({
      ...store,
      now: Date.now(),
    });

    assert.equal(rotated.activeKey?.keyId, initial.keyId);
    assert.notEqual(rotated.signingKey.keyId, initial.keyId);

    const duringRetention = await buildMcpOAuthPublicJwks({
      listSigningKeys: store.listSigningKeys,
      now: rotated.rotatedAt + MCP_OAUTH_RETIRED_SIGNING_KEY_RETENTION_MS - 1,
    });
    const afterRetention = await buildMcpOAuthPublicJwks({
      listSigningKeys: store.listSigningKeys,
      now: rotated.rotatedAt + MCP_OAUTH_RETIRED_SIGNING_KEY_RETENTION_MS + 1,
    });

    assert.equal(duringRetention.keys.length, 2);
    assert.equal(afterRetention.keys.length, 1);
  });
});
