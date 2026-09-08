import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  permissionIntersectionConformanceCases,
  permissionMatcherConformanceCases,
} from "./permissions-conformance";
import { getExpandedPermissions, hasPermission, intersectPermissions } from "./permissions";

describe("canonical permission policy", () => {
  for (const testCase of permissionMatcherConformanceCases) {
    it(testCase.name, () => {
      assert.equal(hasPermission(testCase.granted, testCase.required), testCase.expected);
    });
  }

  for (const testCase of permissionIntersectionConformanceCases) {
    it(`intersection: ${testCase.name}`, () => {
      assert.deepEqual(
        intersectPermissions(testCase.owner, testCase.narrowed).toSorted(),
        [...testCase.expected].toSorted(),
      );
    });
  }

  it("drops unknown and malformed grants during catalog-bounded expansion", () => {
    assert.deepEqual(
      getExpandedPermissions(
        { "billing:read": "", "billing:write": "", "people:read": "" },
        {
          role: ["billing:*", "unknown:read", "billing:**", ""],
        },
        "role",
      ).toSorted(),
      ["billing:read", "billing:write"],
    );
  });
});
