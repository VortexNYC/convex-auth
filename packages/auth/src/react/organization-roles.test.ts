import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  canSubmitConvexOrganizationRoleForm,
  getConvexOrganizationRoleManagerErrorMessage,
  groupConvexOrganizationPermissions,
  isConvexOrganizationSystemRole,
  toggleConvexOrganizationRolePermission,
} from "./organization-roles";

describe("organization role helpers", () => {
  it("blocks role creation without a name, permissions, or idle form", () => {
    assert.equal(
      canSubmitConvexOrganizationRoleForm({
        creating: false,
        name: "Ops lead",
        permissions: ["people:view"],
      }),
      true,
    );
    assert.equal(
      canSubmitConvexOrganizationRoleForm({
        creating: false,
        name: " ",
        permissions: ["people:view"],
      }),
      false,
    );
    assert.equal(
      canSubmitConvexOrganizationRoleForm({
        creating: false,
        name: "Ops lead",
        permissions: [],
      }),
      false,
    );
    assert.equal(
      canSubmitConvexOrganizationRoleForm({
        creating: true,
        name: "Ops lead",
        permissions: ["people:view"],
      }),
      false,
    );
  });

  it("toggles selected permissions without mutating the input", () => {
    const current = ["people:view", "companies:view"];
    assert.deepEqual(toggleConvexOrganizationRolePermission(current, "people:view"), [
      "companies:view",
    ]);
    assert.deepEqual(toggleConvexOrganizationRolePermission(current, "tasks:view"), [
      "people:view",
      "companies:view",
      "tasks:view",
    ]);
    assert.deepEqual(current, ["people:view", "companies:view"]);
  });

  it("groups permissions by prefix", () => {
    assert.deepEqual(
      groupConvexOrganizationPermissions([
        { key: "people:view", description: "View people" },
        { key: "people:edit", description: "Edit people" },
        { key: "system" },
      ]),
      [
        {
          label: "people",
          permissions: [
            { key: "people:view", description: "View people" },
            { key: "people:edit", description: "Edit people" },
          ],
        },
        { label: "general", permissions: [{ key: "system" }] },
      ],
    );
  });

  it("detects system roles across both supported role shapes", () => {
    assert.equal(isConvexOrganizationSystemRole({ isSystem: true }), true);
    assert.equal(isConvexOrganizationSystemRole({ type: "system" }), true);
    assert.equal(isConvexOrganizationSystemRole({ type: "custom" }), false);
  });

  it("returns stable role mutation error copy", () => {
    assert.equal(
      getConvexOrganizationRoleManagerErrorMessage(new Error("Nope"), "Fallback"),
      "Nope",
    );
    assert.equal(getConvexOrganizationRoleManagerErrorMessage("bad", "Fallback"), "Fallback");
  });
});
