import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { buildExpoAuthSignUpUrl } from "./auth-page-utils";

describe("buildExpoAuthSignUpUrl", () => {
  it("appends token to sign-up path", () => {
    assert.equal(
      buildExpoAuthSignUpUrl({ signUpPath: "/sign-up", token: "abc123" }),
      "/sign-up?token=abc123",
    );
  });

  it("encodes token and email", () => {
    assert.equal(
      buildExpoAuthSignUpUrl({
        signUpPath: "/sign-up",
        token: "a&b=c",
        email: "hello+tag@example.com",
      }),
      "/sign-up?token=a%26b%3Dc&email=hello%2Btag%40example.com",
    );
  });

  it("preserves existing search params on the sign-up path", () => {
    assert.equal(
      buildExpoAuthSignUpUrl({
        signUpPath: "/sign-up?ref=invite",
        token: "abc123",
        email: "test@example.com",
      }),
      "/sign-up?ref=invite&token=abc123&email=test%40example.com",
    );
  });

  it("omits email when not provided", () => {
    assert.equal(
      buildExpoAuthSignUpUrl({ signUpPath: "/sign-up", token: "abc123", email: null }),
      "/sign-up?token=abc123",
    );
  });
});
