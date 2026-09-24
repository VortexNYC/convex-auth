import assert from "node:assert/strict";

import convexAuthTest, { modules, register, schema } from "@vortex-api/convex-auth/test";
import { convexTest } from "convex-test";
import { componentsGeneric, defineSchema } from "convex/server";
import { describe, it } from "vitest";

const components = componentsGeneric();

const consumerModules = {
  "./convex/_generated/api.ts": () => Promise.resolve({}),
};

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

  it("exposes register as a named export with an overridable component name", () => {
    const names: string[] = [];
    register(
      {
        registerComponent(name) {
          names.push(name);
        },
      },
      "customAuth",
    );
    assert.deepEqual(names, ["customAuth"]);
  });

  it("registers into a real convex-test harness and resolves component functions", async () => {
    const t = convexTest(defineSchema({}), consumerModules);
    register(t);
    const status = await t.query(
      (components as { convexAuth: { status: { get: never } } }).convexAuth.status.get,
    );
    assert.deepEqual(status, { component: "convexAuth", schemaVersion: 1 });
  });
});
