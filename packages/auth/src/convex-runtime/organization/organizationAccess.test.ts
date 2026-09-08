import assert from "node:assert/strict";

import { hasPermission } from "../../core";
import { describe, test } from "vitest";

import {
  buildOrganizationPermissionContext,
  resolveActiveOrganization,
  resolveAvailableOrganizations,
  type OrganizationAccessMembershipLike,
  type OrganizationAccessOrganizationLike,
  type OrganizationAccessUserLike,
} from "./organizationAccess";

type TestId = string;
type TestRole = "owner" | "admin" | "manager" | "member" | "viewer";

type TestOrganization = OrganizationAccessOrganizationLike & {
  name: string;
};

const rolePermissions: Record<TestRole, readonly string[]> = {
  owner: ["*"],
  admin: ["organization:*", "people:*", "settings:*"],
  manager: ["organization:view", "people:*", "settings:view"],
  member: ["organization:view", "people:view", "people:edit"],
  viewer: ["organization:view", "people:view"],
};

function makeOrganization(
  _id: TestId,
  status: TestOrganization["status"],
  name: string,
): TestOrganization {
  return { _id, status, name };
}

function makeMembership(
  organizationId: TestId,
  roleTemplate: TestRole,
  status: OrganizationAccessMembershipLike<TestId, TestRole>["status"],
): OrganizationAccessMembershipLike<TestId, TestRole> {
  return { organizationId, roleTemplate, status };
}

describe("resolveAvailableOrganizations", () => {
  test("returns every active organization for super admins", () => {
    const user: OrganizationAccessUserLike = { isSuperAdmin: true };
    const organizations = [
      makeOrganization("org_1", "active", "Alpha"),
      makeOrganization("org_2", "suspended", "Bravo"),
      makeOrganization("org_3", "active", "Charlie"),
    ];

    const available = resolveAvailableOrganizations(user, [], organizations, {
      superAdminRole: "owner",
    });

    assert.deepEqual(available, [
      {
        _id: "org_1",
        name: "Alpha",
        status: "active",
        canSelect: true,
        roleTemplate: "owner",
      },
      {
        _id: "org_3",
        name: "Charlie",
        status: "active",
        canSelect: true,
        roleTemplate: "owner",
      },
    ]);
  });

  test("keeps pending memberships visible but not selectable", () => {
    const user: OrganizationAccessUserLike = {};
    const organizations = [
      makeOrganization("org_1", "active", "Alpha"),
      makeOrganization("org_2", "active", "Bravo"),
      makeOrganization("org_3", "deleted", "Charlie"),
    ];
    const memberships = [
      makeMembership("org_1", "admin", "active"),
      makeMembership("org_2", "viewer", "pending"),
      makeMembership("org_3", "member", "active"),
      makeMembership("org_4", "member", "inactive"),
    ];

    const available = resolveAvailableOrganizations(user, memberships, organizations, {
      superAdminRole: "owner",
    });

    assert.deepEqual(available, [
      {
        _id: "org_1",
        name: "Alpha",
        status: "active",
        canSelect: true,
        roleTemplate: "admin",
      },
      {
        _id: "org_2",
        name: "Bravo",
        status: "active",
        canSelect: false,
        roleTemplate: "viewer",
      },
    ]);
  });
});

describe("resolveActiveOrganization", () => {
  test("prefers explicit active organization when membership allows it", () => {
    const user: OrganizationAccessUserLike = { activeOrganizationId: "org_2" };
    const activeOrganization = makeOrganization("org_2", "active", "Bravo");
    const available = [
      {
        ...makeOrganization("org_1", "active", "Alpha"),
        canSelect: true,
        roleTemplate: "admin" as const,
      },
      {
        ...makeOrganization("org_2", "active", "Bravo"),
        canSelect: true,
        roleTemplate: "member" as const,
      },
    ];

    const resolved = resolveActiveOrganization(user, available, activeOrganization, {
      superAdminRole: "owner",
    });

    assert.equal(resolved?._id, "org_2");
    assert.equal(resolved?.roleTemplate, "member");
  });

  test("falls back to first selectable organization when active organization is invalid", () => {
    const user: OrganizationAccessUserLike = { activeOrganizationId: "org_2" };
    const activeOrganization = makeOrganization("org_2", "deleted", "Bravo");
    const available = [
      {
        ...makeOrganization("org_1", "active", "Alpha"),
        canSelect: true,
        roleTemplate: "admin" as const,
      },
      {
        ...makeOrganization("org_2", "active", "Bravo"),
        canSelect: false,
        roleTemplate: "viewer" as const,
      },
    ];

    const resolved = resolveActiveOrganization(user, available, activeOrganization, {
      superAdminRole: "owner",
    });

    assert.equal(resolved?._id, "org_1");
  });
});

describe("buildOrganizationPermissionContext", () => {
  test("maps admin role to domain wildcard permissions", () => {
    const context = buildOrganizationPermissionContext({
      user: { isSuperAdmin: false },
      organization: { _id: "org_1", roleTemplate: "admin" },
      userId: "user_1",
      expandPermissions: (role) => rolePermissions[role],
      hasPermission,
      ownerRoles: ["owner"],
      adminRoles: ["owner", "admin"],
    });

    assert.equal(context.role, "admin");
    assert.equal(context.isAdmin, true);
    assert.equal(context.isOwner, false);
    assert.equal(context.hasPermission("people:delete"), true);
    assert.equal(context.hasPermission("organization:edit"), true);
    assert.equal(context.hasPermission("system:super"), false);
  });

  test("grants super admins full access regardless of role template", () => {
    const context = buildOrganizationPermissionContext({
      user: { isSuperAdmin: true },
      organization: { _id: "org_1", roleTemplate: "viewer" },
      userId: "user_1",
      expandPermissions: (role) => rolePermissions[role],
      hasPermission,
      superAdminRole: "owner",
      ownerRoles: ["owner"],
      adminRoles: ["owner", "admin"],
    });

    assert.equal(context.role, "owner");
    assert.deepEqual(context.permissions, ["*"]);
    assert.equal(context.hasPermission("system:super"), true);
    assert.equal(context.hasPermission("tasks:delete"), true);
  });
});
