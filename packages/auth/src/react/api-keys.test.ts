import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  canSubmitConvexApiKeyCreateForm,
  getConvexApiKeyCreatorLabel,
  getConvexApiKeyExpiresAt,
  parseConvexApiKeyAllowedIpRanges,
} from "./api-keys";

describe("api key helpers", () => {
  it("parses comma and newline separated IP allowlist values", () => {
    assert.deepEqual(
      parseConvexApiKeyAllowedIpRanges("203.0.113.10, 203.0.113.0/24\n\n198.51.100.4"),
      ["203.0.113.10", "203.0.113.0/24", "198.51.100.4"],
    );
  });

  it("derives optional expiration timestamps from day counts", () => {
    const now = 1_700_000_000_000;

    assert.equal(getConvexApiKeyExpiresAt("none", now), undefined);
    assert.equal(getConvexApiKeyExpiresAt("", now), undefined);
    assert.equal(getConvexApiKeyExpiresAt("bad", now), undefined);
    assert.equal(getConvexApiKeyExpiresAt("7", now), now + 7 * 24 * 60 * 60 * 1000);
  });

  it("blocks create submission unless the form has the minimum secure inputs", () => {
    assert.equal(
      canSubmitConvexApiKeyCreateForm({
        apiEnabled: false,
        creating: false,
        name: "Production",
        scopes: ["contacts:read"],
      }),
      false,
    );
    assert.equal(
      canSubmitConvexApiKeyCreateForm({
        apiEnabled: true,
        creating: true,
        name: "Production",
        scopes: ["contacts:read"],
      }),
      false,
    );
    assert.equal(
      canSubmitConvexApiKeyCreateForm({
        apiEnabled: true,
        creating: false,
        name: " ",
        scopes: ["contacts:read"],
      }),
      false,
    );
    assert.equal(
      canSubmitConvexApiKeyCreateForm({
        apiEnabled: true,
        creating: false,
        name: "Production",
        scopes: [],
      }),
      false,
    );
    assert.equal(
      canSubmitConvexApiKeyCreateForm({
        apiEnabled: true,
        creating: false,
        name: "Production",
        scopes: ["contacts:read"],
      }),
      true,
    );
  });

  it("prefers creator name, creator email, then unknown label", () => {
    assert.equal(
      getConvexApiKeyCreatorLabel({
        createdBy: { _id: "user_1", name: "Jane", email: "jane@example.com" },
      }),
      "Jane",
    );
    assert.equal(
      getConvexApiKeyCreatorLabel({
        createdBy: { _id: "user_1", email: "jane@example.com" },
      }),
      "jane@example.com",
    );
    assert.equal(getConvexApiKeyCreatorLabel({ createdBy: null }, "Unknown"), "Unknown");
  });
});
