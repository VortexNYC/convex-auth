import assert from "node:assert/strict";

import {
  permissionIntersectionConformanceCases,
  permissionMatcherConformanceCases,
} from "../../core";
import { describe, it } from "vitest";

import type { AuthPrincipal, ResolvedAuthContext } from "../coreTypes";
import { computeEffectiveApiKeyPermissions } from "../machine/computeEffectiveApiKeyPermissions";
import { authorizePermission } from "./authorize";

const execution: ResolvedAuthContext["execution"] = {
  organizationId: "org_1",
  resourceType: null,
  resourceId: null,
  audience: null,
  scopes: [],
};

function decision(principal: AuthPrincipal, required: string): boolean {
  return authorizePermission({ principal, execution }, required).allowed;
}

describe("permission matcher conformance across machine principals and authorize()", () => {
  for (const testCase of permissionMatcherConformanceCases) {
    it(testCase.name, () => {
      const permissions = [...testCase.granted];
      const userAllowed = decision(
        {
          kind: "user",
          userId: "user_1",
          identityId: "identity_1",
          activeOrganizationId: "org_1",
          membershipIds: ["membership_1"],
          roleKeys: ["member"],
          permissions,
          sessionId: null,
          isRestricted: false,
          restrictedReason: null,
        },
        testCase.required,
      );
      const serviceAllowed = decision(
        {
          kind: "service",
          serviceId: "service_1",
          keyId: "key_1",
          organizationId: "org_1",
          permissions,
          isRestricted: false,
          restrictedReason: null,
        },
        testCase.required,
      );
      const effectivePermissions = computeEffectiveApiKeyPermissions({
        ownerPermissions: ["*"],
        apiKey: { permissions },
      });
      const apiKeyAllowed = decision(
        {
          kind: "apiKey",
          apiKeyId: "api_key_1",
          ownerType: "user",
          ownerId: "user_1",
          organizationId: "org_1",
          inheritedPermissions: ["*"],
          narrowedPermissions: permissions,
          effectivePermissions,
          isRestricted: false,
          restrictedReason: null,
        },
        testCase.required,
      );
      const oauthAllowed = decision(
        {
          kind: "oauthClient",
          clientId: "oauth_1",
          subjectType: "client",
          subjectId: null,
          organizationId: "org_1",
          audience: null,
          scopes: [],
          permissions,
          isRestricted: false,
          restrictedReason: null,
        },
        testCase.required,
      );

      assert.deepEqual(
        { userAllowed, serviceAllowed, apiKeyAllowed, oauthAllowed },
        {
          userAllowed: testCase.expected,
          serviceAllowed: testCase.expected,
          apiKeyAllowed: testCase.expected,
          oauthAllowed: testCase.expected,
        },
      );
    });
  }

  for (const testCase of permissionIntersectionConformanceCases) {
    it(`api-key narrowing: ${testCase.name}`, () => {
      assert.deepEqual(
        computeEffectiveApiKeyPermissions({
          ownerPermissions: testCase.owner,
          apiKey: { permissions: [...testCase.narrowed] },
        }).toSorted(),
        [...testCase.expected].toSorted(),
      );
    });
  }
});
