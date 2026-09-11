import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { canSubmitConvexServicePrincipalCreateForm } from "./use-service-principals";

describe("canSubmitConvexServicePrincipalCreateForm", () => {
  it("allows submit when key, name, and at least one permission are set", () => {
    assert.equal(
      canSubmitConvexServicePrincipalCreateForm({
        key: "payments-worker",
        name: "Payments worker",
        permissions: ["read"],
      }),
      true,
    );
  });

  it("blocks submit while creating", () => {
    assert.equal(
      canSubmitConvexServicePrincipalCreateForm({
        key: "payments-worker",
        name: "Payments worker",
        permissions: ["read"],
        creating: true,
      }),
      false,
    );
  });

  it("blocks submit without a key", () => {
    assert.equal(
      canSubmitConvexServicePrincipalCreateForm({
        key: "",
        name: "Payments worker",
        permissions: ["read"],
      }),
      false,
    );
  });

  it("blocks submit without a name", () => {
    assert.equal(
      canSubmitConvexServicePrincipalCreateForm({
        key: "payments-worker",
        name: "",
        permissions: ["read"],
      }),
      false,
    );
  });

  it("blocks submit without permissions", () => {
    assert.equal(
      canSubmitConvexServicePrincipalCreateForm({
        key: "payments-worker",
        name: "Payments worker",
        permissions: [],
      }),
      false,
    );
  });

  it("rejects whitespace-only key or name", () => {
    assert.equal(
      canSubmitConvexServicePrincipalCreateForm({
        key: "   ",
        name: "Payments worker",
        permissions: ["read"],
      }),
      false,
    );
    assert.equal(
      canSubmitConvexServicePrincipalCreateForm({
        key: "payments-worker",
        name: "   ",
        permissions: ["read"],
      }),
      false,
    );
  });
});
