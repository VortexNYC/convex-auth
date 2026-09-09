import assert from "node:assert/strict";

import { permissionMatcherConformanceCases } from ".";
import { describe, it } from "vitest";

import { createPermissionEngine } from "./createPermissionEngine";

// ---------------------------------------------------------------------------
// Proof matrix for Increment 5a — the wildcard permission engine.
//
// THE invariant: the matching semantics (`*` super, `domain:*` domain-wildcard,
// exact) are defined ONCE in the package. A consumer cannot author a subtly
// wrong matcher. `expandPermissions` resolves a role's wildcard grants against
// the registry; `hasPermission` never grants something the user's permission
// set does not actually cover.
// ---------------------------------------------------------------------------

// A small registry across two domains plus an unrelated one.
const REGISTRY = {
  "companies:view": "",
  "companies:edit": "",
  "companies:delete": "",
  "contacts:view": "",
  "contacts:edit": "",
  "reports:view": "",
} as const;

type TestRole = "owner" | "manager" | "viewer";

const ROLE_CATALOG: Record<TestRole, readonly string[]> = {
  owner: ["*"],
  manager: ["companies:*", "contacts:view"],
  viewer: ["companies:view", "reports:view"],
};

const engine = createPermissionEngine<TestRole>({
  registry: REGISTRY,
  roleCatalog: ROLE_CATALOG,
});

describe("createPermissionEngine — hasPermission (wildcard matching)", () => {
  for (const testCase of permissionMatcherConformanceCases) {
    it(`shared conformance: ${testCase.name}`, () => {
      assert.equal(engine.hasPermission(testCase.granted, testCase.required), testCase.expected);
    });
  }

  it("`*` grants everything", () => {
    assert.equal(engine.hasPermission(["*"], "companies:view"), true);
    assert.equal(engine.hasPermission(["*"], "anything:at:all"), true);
  });

  it("exact grant matches only itself", () => {
    assert.equal(engine.hasPermission(["companies:view"], "companies:view"), true);
    assert.equal(engine.hasPermission(["companies:view"], "companies:edit"), false);
    assert.equal(engine.hasPermission(["companies:view"], "contacts:view"), false);
  });

  it("`domain:*` grants only that domain", () => {
    assert.equal(engine.hasPermission(["companies:*"], "companies:view"), true);
    assert.equal(engine.hasPermission(["companies:*"], "companies:delete"), true);
    // does NOT leak into another domain
    assert.equal(engine.hasPermission(["companies:*"], "contacts:view"), false);
    assert.equal(engine.hasPermission(["companies:*"], "reports:view"), false);
  });

  it("empty permission set denies everything", () => {
    assert.equal(engine.hasPermission([], "companies:view"), false);
  });

  it("a permission with no domain segment is matched only by `*` or exact", () => {
    assert.equal(engine.hasPermission(["companies:*"], "standalone"), false);
    assert.equal(engine.hasPermission(["standalone"], "standalone"), true);
    assert.equal(engine.hasPermission(["*"], "standalone"), true);
  });
});

describe("createPermissionEngine — expandPermissions (role → concrete keys)", () => {
  it("`*` expands to the FULL registry", () => {
    const owner = engine.expandPermissions("owner");
    assert.deepEqual([...owner].toSorted(), Object.keys(REGISTRY).toSorted());
  });

  it("`domain:*` expands to only that domain's registry keys + keeps exact grants", () => {
    const manager = [...engine.expandPermissions("manager")].toSorted();
    assert.deepEqual(
      manager,
      ["companies:delete", "companies:edit", "companies:view", "contacts:view"].toSorted(),
    );
    // contacts:edit was NOT granted (manager only has contacts:view exact)
    assert.equal(manager.includes("contacts:edit"), false);
    // reports:view not granted at all
    assert.equal(manager.includes("reports:view"), false);
  });

  it("exact grants expand to themselves only", () => {
    const viewer = [...engine.expandPermissions("viewer")].toSorted();
    assert.deepEqual(viewer, ["companies:view", "reports:view"]);
  });

  it("a role grant not present in the registry is DROPPED (never invents a permission)", () => {
    const e = createPermissionEngine<"ghost">({
      registry: REGISTRY,
      roleCatalog: { ghost: ["companies:view", "not:in:registry"] },
    });
    assert.deepEqual([...e.expandPermissions("ghost")].toSorted(), ["companies:view"]);
  });

  it("expanded permissions still resolve via hasPermission (exact, post-expansion)", () => {
    const ownerPerms = engine.expandPermissions("owner");
    assert.equal(engine.hasPermission(ownerPerms, "reports:view"), true);
    const managerPerms = engine.expandPermissions("manager");
    assert.equal(engine.hasPermission(managerPerms, "companies:delete"), true);
    assert.equal(engine.hasPermission(managerPerms, "reports:view"), false);
  });
});

describe("createPermissionEngine — any/all composition", () => {
  it("hasAnyPermission: true if ANY required is granted", () => {
    assert.equal(
      engine.hasAnyPermission(["companies:view"], ["companies:view", "reports:view"]),
      true,
    );
    assert.equal(
      engine.hasAnyPermission(["companies:view"], ["reports:view", "contacts:view"]),
      false,
    );
    assert.equal(engine.hasAnyPermission([], ["companies:view"]), false);
  });

  it("hasAllPermissions: true only if ALL required are granted", () => {
    assert.equal(
      engine.hasAllPermissions(["companies:*", "reports:view"], ["companies:view", "reports:view"]),
      true,
    );
    assert.equal(
      engine.hasAllPermissions(["companies:*"], ["companies:view", "reports:view"]),
      false,
    );
    assert.equal(engine.hasAllPermissions(["*"], ["a", "b", "c"]), true);
  });
});

describe("createPermissionEngine — registry/roleCatalog input shapes", () => {
  it("accepts a registry as a string array", () => {
    const e = createPermissionEngine<"owner">({
      registry: ["companies:view", "companies:edit", "reports:view"],
      roleCatalog: { owner: ["companies:*"] },
    });
    assert.deepEqual([...e.expandPermissions("owner")].toSorted(), [
      "companies:edit",
      "companies:view",
    ]);
  });

  it("accepts a roleCatalog with { permissions } entries", () => {
    const e = createPermissionEngine<"manager">({
      registry: REGISTRY,
      roleCatalog: { manager: { permissions: ["reports:view"] } },
    });
    assert.deepEqual([...e.expandPermissions("manager")], ["reports:view"]);
  });
});
