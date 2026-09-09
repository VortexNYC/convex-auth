import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { parseExpoSessionRestore } from "./session-restore";

describe("convex expo session restore", () => {
  it("restores valid session with user", () => {
    const result = parseExpoSessionRestore({
      data: { user: { id: "user_1", name: "Test User" } },
      isPending: false,
    });
    assert.equal(result.kind, "restored");
    if (result.kind === "restored") {
      assert.equal(result.userId, "user_1");
    }
  });

  it("reports no session when pending", () => {
    const result = parseExpoSessionRestore({
      isPending: true,
    });
    assert.deepEqual(result, {
      kind: "none",
      reason: "no_session",
    });
  });

  it("reports no session when data is null", () => {
    const result = parseExpoSessionRestore({
      data: null,
      isPending: false,
    });
    assert.equal(result.kind, "none");
  });

  it("reports corrupted when user is missing", () => {
    const result = parseExpoSessionRestore({
      data: {},
      isPending: false,
    });
    assert.deepEqual(result, { kind: "none", reason: "corrupted" });
  });

  it("reports corrupted when user id is not string", () => {
    const result = parseExpoSessionRestore({
      data: { user: { id: 42 } },
      isPending: false,
    });
    assert.deepEqual(result, { kind: "none", reason: "corrupted" });
  });

  it("reports error when session fetch errored", () => {
    const err = new Error("network");
    const result = parseExpoSessionRestore({
      data: null,
      error: err,
      isPending: false,
    });
    assert.equal(result.kind, "error");
    if (result.kind === "error") {
      assert.equal(result.error, err);
    }
  });
});
