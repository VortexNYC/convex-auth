import assert from "node:assert/strict";

import convexAuthTest, { modules, schema } from "@vortex-api/convex-auth/test";
import { describe, it } from "vitest";

describe("@vortex-api/convex-auth/test consumer entry", () => {
  it("loads through Vite and registers the packaged component modules", () => {
    assert.ok(Object.keys(modules).length > 0);
    let registered = false;
    convexAuthTest.register({
      registerComponent(name, registeredSchema, registeredModules) {
        assert.equal(name, "convexAuth");
        assert.equal(registeredSchema, schema);
        assert.equal(registeredModules, modules);
        registered = true;
      },
    });
    assert.equal(registered, true);
  });
});
