import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { hashApiKeySecret } from "../machine";
import { ApiAuthError } from "./errors";
import { resolveStoredApiKeyCredentialForRequest } from "./resolveStoredApiKeyCredentialForRequest";

describe("resolveStoredApiKeyCredentialForRequest", () => {
  it("validates stored key credentials and enforces IP allowlists", async () => {
    const keyHash = await hashApiKeySecret("secret");
    const result = await resolveStoredApiKeyCredentialForRequest({
      token: "app_live_123.secret",
      headers: new Headers({ "x-forwarded-for": "203.0.113.10" }),
      findByKeyPrefix: async (keyPrefix) => ({
        keyPrefix,
        keyHash,
        status: "active" as const,
        allowedIpRanges: ["203.0.113.0/24"],
      }),
    });

    assert.equal(result.apiKey.keyPrefix, "app_live_123");
    assert.equal(result.keyPrefix, "app_live_123");
    assert.equal(result.requestIp, "203.0.113.10");
  });

  it("rejects invalid keys with typed package errors", async () => {
    await assert.rejects(
      () =>
        resolveStoredApiKeyCredentialForRequest({
          token: "app_live_123.secret",
          findByKeyPrefix: async () => null,
        }),
      (error: unknown) => error instanceof ApiAuthError && error.code === "API_KEY_INVALID",
    );
  });

  it("rejects missing or disallowed request IPs", async () => {
    const keyHash = await hashApiKeySecret("secret");

    await assert.rejects(
      () =>
        resolveStoredApiKeyCredentialForRequest({
          token: "app_live_123.secret",
          findByKeyPrefix: async (keyPrefix) => ({
            keyPrefix,
            keyHash,
            status: "active" as const,
            allowedIpRanges: ["203.0.113.0/24"],
          }),
        }),
      (error: unknown) => error instanceof ApiAuthError && error.code === "API_KEY_IP_MISSING",
    );

    await assert.rejects(
      () =>
        resolveStoredApiKeyCredentialForRequest({
          token: "app_live_123.secret",
          requestIp: "198.51.100.10",
          findByKeyPrefix: async (keyPrefix) => ({
            keyPrefix,
            keyHash,
            status: "active" as const,
            allowedIpRanges: ["203.0.113.0/24"],
          }),
        }),
      (error: unknown) => error instanceof ApiAuthError && error.code === "API_KEY_IP_FORBIDDEN",
    );
  });
});
