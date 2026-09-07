import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { buildApiAuthOrganizationAccessResult } from "./buildApiAuthOrganizationAccessResult";

describe("buildApiAuthOrganizationAccessResult", () => {
  it("builds deduped roles and permissions for one organization", () => {
    assert.deepEqual(
      buildApiAuthOrganizationAccessResult({
        organizationId: "org_1",
        memberships: [
          {
            _id: "membership_1",
            organizationId: "org_1",
            roleTemplate: "owner",
            status: "active",
          },
          {
            _id: "membership_2",
            organizationId: "org_1",
            roleTemplate: "owner",
            status: "active",
            permissions: ["app:read", "app:write"],
          },
          {
            _id: "membership_3",
            organizationId: "org_2",
            roleTemplate: "member",
            status: "active",
          },
          {
            _id: "membership_4",
            organizationId: "org_1",
            roleTemplate: "member",
            status: "pending",
          },
        ],
        expandPermissions: (role) => (role === "owner" ? ["*"] : ["app:read"]),
      }),
      {
        organizationId: "org_1",
        membershipIds: ["membership_1", "membership_2"],
        roleKeys: ["owner"],
        permissions: ["*", "app:read", "app:write"],
      },
    );
  });

  it("returns empty access when organization is null", () => {
    assert.deepEqual(
      buildApiAuthOrganizationAccessResult({
        organizationId: null,
        memberships: [],
        expandPermissions: () => [],
      }),
      {
        organizationId: null,
        membershipIds: [],
        roleKeys: [],
        permissions: [],
      },
    );
  });
});
