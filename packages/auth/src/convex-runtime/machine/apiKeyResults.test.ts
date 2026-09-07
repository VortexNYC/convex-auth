import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { createConvexApiKeyListItem, createConvexApiKeyTokenResult } from "./apiKeyResults";

describe("createConvexApiKeyTokenResult", () => {
  it("formats one-time API key tokens without mutating caller arrays", () => {
    const scopes = ["organization:read", "people:read"] as const;
    const allowedIpRanges = ["127.0.0.1/32"];

    const result = createConvexApiKeyTokenResult({
      apiKeyId: "key_123",
      keyPrefix: "app_live_abc",
      secret: "secret",
      scopes,
      expiresAt: 123,
      allowedIpRanges,
    });

    assert.deepEqual(result, {
      apiKeyId: "key_123",
      token: "app_live_abc.secret",
      keyPrefix: "app_live_abc",
      scopes: ["organization:read", "people:read"],
      expiresAt: 123,
      allowedIpRanges: ["127.0.0.1/32"],
    });
    assert.notEqual(result.scopes, scopes);
    assert.notEqual(result.allowedIpRanges, allowedIpRanges);
  });

  it("defaults allowed IP ranges to an empty array", () => {
    const result = createConvexApiKeyTokenResult({
      apiKeyId: "key_123",
      keyPrefix: "app_live_abc",
      secret: "secret",
      scopes: ["organization:read"],
    });

    assert.deepEqual(result.allowedIpRanges, []);
  });

  it("normalizes API key list items for app query results", () => {
    const scopes = ["organization:read"] as const;
    const result = createConvexApiKeyListItem({
      apiKey: {
        _id: "key_123",
        name: "Production",
        keyPrefix: "app_live_abc",
        scopes,
        status: "active",
        createdAt: 100,
        updatedAt: 200,
      },
      createdBy: {
        _id: "user_123",
        email: "owner@example.com",
      },
    });

    assert.deepEqual(result, {
      _id: "key_123",
      name: "Production",
      keyPrefix: "app_live_abc",
      scopes: ["organization:read"],
      status: "active",
      expiresAt: undefined,
      allowedIpRanges: [],
      lastUsedAt: undefined,
      lastUsedIp: undefined,
      createdAt: 100,
      updatedAt: 200,
      createdBy: {
        _id: "user_123",
        email: "owner@example.com",
      },
    });
    assert.notEqual(result.scopes, scopes);
  });
});
