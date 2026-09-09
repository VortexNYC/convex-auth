import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  canSubmitConvexOrganizationInviteForm,
  countConvexActiveOwners,
  getConvexOrganizationMemberLabel,
  getConvexOrganizationMemberMutationErrorMessage,
  getConvexOrganizationMemberStatusLabel,
  getConvexOrganizationRoleLabel,
  isConvexLastActiveOwner,
  resolveConvexOrganizationDefaultInviteRole,
} from "./organization-members";

describe("organization member helpers", () => {
  it("blocks invitation submission without a valid email, role, or idle form", () => {
    assert.equal(
      canSubmitConvexOrganizationInviteForm({
        email: "member@example.com",
        inviting: false,
        roleTemplate: "member",
      }),
      true,
    );
    assert.equal(
      canSubmitConvexOrganizationInviteForm({
        email: "member.example.com",
        inviting: false,
        roleTemplate: "member",
      }),
      false,
    );
    assert.equal(
      canSubmitConvexOrganizationInviteForm({
        disabled: true,
        email: "member@example.com",
        inviting: false,
        roleTemplate: "member",
      }),
      false,
    );
    assert.equal(
      canSubmitConvexOrganizationInviteForm({
        email: "member@example.com",
        inviting: true,
        roleTemplate: "member",
      }),
      false,
    );
  });

  it("labels members from name, email, then fallback", () => {
    assert.equal(
      getConvexOrganizationMemberLabel({
        user: { name: "Jane", email: "jane@example.com" },
      }),
      "Jane",
    );
    assert.equal(
      getConvexOrganizationMemberLabel({
        user: { email: "jane@example.com" },
      }),
      "jane@example.com",
    );
    assert.equal(getConvexOrganizationMemberLabel({ user: null }, "Unknown"), "Unknown");
  });

  it("formats role and status labels", () => {
    assert.equal(getConvexOrganizationRoleLabel("owner"), "Owner");
    assert.equal(getConvexOrganizationMemberStatusLabel("suspended"), "Suspended");
  });

  it("detects the last active owner", () => {
    const members = [
      { roleTemplate: "owner", status: "active" },
      { roleTemplate: "admin", status: "active" },
      { roleTemplate: "owner", status: "suspended" },
    ] as const;

    assert.equal(countConvexActiveOwners(members), 1);
    assert.equal(isConvexLastActiveOwner(members[0], 1), true);
    assert.equal(isConvexLastActiveOwner(members[1], 1), false);
    assert.equal(isConvexLastActiveOwner(members[2], 1), false);
  });

  it("returns stable member mutation error copy", () => {
    assert.equal(
      getConvexOrganizationMemberMutationErrorMessage(new Error("Nope"), "Fallback"),
      "Nope",
    );
    assert.equal(getConvexOrganizationMemberMutationErrorMessage("bad", "Fallback"), "Fallback");
  });

  it("uses an explicit invite role default before falling back to option order", () => {
    assert.equal(
      resolveConvexOrganizationDefaultInviteRole({
        defaultInviteRoleTemplate: "member",
        roleOptions: ["owner", "member"],
      }),
      "member",
    );
    assert.equal(
      resolveConvexOrganizationDefaultInviteRole({
        roleOptions: ["owner", "member"],
      }),
      "owner",
    );
  });
});
