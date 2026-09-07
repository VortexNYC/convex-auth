import assert from "node:assert/strict";

import { permissionMatcherConformanceCases } from "convex-auth-core";
import { describe, it } from "vitest";

import { createApiKeyScopeRegistry, type ApiKeyScopeFromDescriptors } from "./api-key-scopes";

const scopeDescriptors = [
  {
    scope: "app:read",
    requiredPermissions: ["app:view"],
    defaultSelected: true,
  },
  {
    scope: "app:write",
    requiredPermissions: ["app:edit", "app:manage"],
  },
  {
    scope: "app:ping",
  },
] as const;

type TestScope = ApiKeyScopeFromDescriptors<typeof scopeDescriptors>;

describe("createApiKeyScopeRegistry", () => {
  for (const testCase of permissionMatcherConformanceCases) {
    it(`shared conformance: ${testCase.name}`, () => {
      const registry = createApiKeyScopeRegistry([
        {
          scope: "test:scope",
          requiredPermissions: [testCase.required],
        },
      ]);
      assert.equal(registry.canUseScope("test:scope", testCase.granted), testCase.expected);
    });
  }

  it("builds stable scope lists from descriptors", () => {
    const registry = createApiKeyScopeRegistry(scopeDescriptors);

    assert.deepEqual(registry.scopes, ["app:read", "app:write", "app:ping"]);
    assert.deepEqual(registry.defaultScopes, ["app:read"]);
  });

  it("normalizes, deduplicates, and validates scopes", () => {
    const registry = createApiKeyScopeRegistry(scopeDescriptors);

    assert.deepEqual(registry.normalizeScopes([" app:read ", "unknown", "app:read"]), ["app:read"]);
    assert.deepEqual(registry.requireKnownScopes([" app:read ", "app:write", "app:read"]), [
      "app:read",
      "app:write",
    ]);
    assert.throws(() => registry.requireKnownScopes(["unknown"]), /Unknown API key scope/);
  });

  it("checks scope permissions against descriptor requirements", () => {
    const registry = createApiKeyScopeRegistry(scopeDescriptors);

    assert.equal(registry.canUseScope("app:read", ["app:view"]), true);
    assert.equal(registry.canUseScope("app:read", ["app:*"]), true);
    assert.equal(registry.canUseScope("app:read", ["*"]), true);
    assert.equal(registry.canUseScope("app:write", ["app:edit"]), true);
    assert.equal(registry.canUseScope("app:write", ["app:view"]), false);
    assert.equal(registry.canUseScope("app:ping", []), true);
    assert.deepEqual(registry.filterUsableScopes(["app:read", "app:write"], ["app:view"]), [
      "app:read",
    ]);
  });

  it("does not let a domain wildcard satisfy a bare (non-namespaced) required permission", () => {
    // Parity with createPermissionEngine: a domain wildcard ("billing:*") matches
    // only namespaced permissions ("billing:read"), never a bare "billing". Before
    // the fix this returned true here and false in the engine — a scope-elevation gap.
    const registry = createApiKeyScopeRegistry([
      { scope: "billing:sync", requiredPermissions: ["billing"] },
    ] as const);

    assert.equal(registry.canUseScope("billing:sync", ["billing:*"]), false);
    assert.equal(registry.canUseScope("billing:sync", ["billing"]), true);
    assert.equal(registry.canUseScope("billing:sync", ["*"]), true);
  });

  it("rejects duplicate descriptors", () => {
    const duplicated = [{ scope: "app:read" }, { scope: "app:read" }] as const satisfies readonly {
      scope: TestScope;
    }[];

    assert.throws(() => createApiKeyScopeRegistry(duplicated), /Duplicate API key scope/);
  });
});
