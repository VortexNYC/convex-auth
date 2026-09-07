import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { hashApiKeySecret } from "./apiKeySecret";
import {
  createApiKeyPrefix,
  createApiKeySecret,
  formatApiKeyToken,
  parseApiKeyToken,
  resolveStoredApiKeyCredential,
} from "./apiKeyToken";

describe("api key token utilities", () => {
  it("creates app-prefixed key prefixes", () => {
    assert.equal(
      createApiKeyPrefix({
        tokenPrefix: "app_live",
        randomUUID: () => "12345678-1234-1234-1234-123456789abc",
      }),
      "app_live_1234567812341234",
    );
  });

  it("creates 64 character secrets from two UUIDs", () => {
    assert.equal(
      createApiKeySecret({
        randomUUID: () => "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      }),
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
  });

  it("formats and parses tokens", () => {
    const token = formatApiKeyToken({
      keyPrefix: "app_live_123",
      secret: "secret",
    });
    assert.equal(token, "app_live_123.secret");
    assert.deepEqual(parseApiKeyToken(token), {
      ok: true,
      keyPrefix: "app_live_123",
      secret: "secret",
    });
  });

  it("rejects malformed tokens", () => {
    assert.deepEqual(parseApiKeyToken("no-dot"), {
      ok: false,
      reason: "missing_separator",
    });
    assert.deepEqual(parseApiKeyToken(".secret"), {
      ok: false,
      reason: "missing_prefix",
    });
    assert.deepEqual(parseApiKeyToken("prefix."), {
      ok: false,
      reason: "missing_secret",
    });
  });

  it("resolves active stored credentials", async () => {
    const keyHash = await hashApiKeySecret("secret");
    const result = await resolveStoredApiKeyCredential({
      token: "app_live_123.secret",
      findByKeyPrefix: async (keyPrefix) => ({
        keyPrefix,
        keyHash,
        status: "active" as const,
      }),
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.apiKey.keyPrefix, "app_live_123");
    }
  });

  it("rejects revoked, expired, and mismatched credentials", async () => {
    const keyHash = await hashApiKeySecret("secret");

    assert.deepEqual(
      await resolveStoredApiKeyCredential({
        token: "app_live_123.secret",
        findByKeyPrefix: async (keyPrefix) => ({
          keyPrefix,
          keyHash,
          status: "revoked" as const,
        }),
      }),
      { ok: false, reason: "invalid_key" },
    );

    assert.deepEqual(
      await resolveStoredApiKeyCredential({
        token: "app_live_123.wrong",
        findByKeyPrefix: async (keyPrefix) => ({
          keyPrefix,
          keyHash,
          status: "active" as const,
        }),
      }),
      { ok: false, reason: "invalid_secret" },
    );

    assert.deepEqual(
      await resolveStoredApiKeyCredential({
        token: "app_live_123.secret",
        now: 100,
        findByKeyPrefix: async (keyPrefix) => ({
          keyPrefix,
          keyHash,
          status: "active" as const,
          expiresAt: 100,
        }),
      }),
      { ok: false, reason: "expired" },
    );
  });
});
