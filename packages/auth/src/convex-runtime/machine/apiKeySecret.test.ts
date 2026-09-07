import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  deriveApiKeySecret,
  hashApiKeySecret,
  timingSafeEqualString,
  verifyApiKeySecret,
} from "./apiKeySecret";

describe("api key secret utilities", () => {
  it("hashes and verifies API key secrets", async () => {
    const hash = await hashApiKeySecret("secret");

    assert.equal(hash.length, 64);
    assert.equal(await verifyApiKeySecret({ secret: "secret", expectedHash: hash }), true);
    assert.equal(await verifyApiKeySecret({ secret: "wrong", expectedHash: hash }), false);
  });

  it("derives deterministic secrets from request material", async () => {
    const first = await deriveApiKeySecret({
      derivationSecret: "dev-secret",
      purpose: "app_api_key_secret:v1",
      parts: ["org1", "user1", "request1"],
    });
    const second = await deriveApiKeySecret({
      derivationSecret: "dev-secret",
      purpose: "app_api_key_secret:v1",
      parts: ["org1", "user1", "request1"],
    });
    const different = await deriveApiKeySecret({
      derivationSecret: "dev-secret",
      purpose: "app_api_key_secret:v1",
      parts: ["org1", "user1", "request2"],
    });

    assert.equal(first, second);
    assert.notEqual(first, different);
  });

  it("compares equal length strings without early equality", () => {
    assert.equal(timingSafeEqualString("abc", "abc"), true);
    assert.equal(timingSafeEqualString("abc", "abd"), false);
    assert.equal(timingSafeEqualString("abc", "abcd"), false);
  });
});
