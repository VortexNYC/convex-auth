/// <reference types="vite/client" />

import type { GenericSchema, SchemaDefinition } from "convex/server";

import schema from "./component/schema";

type ConvexTestModules = Record<string, () => Promise<unknown>>;
type ComponentSchema = SchemaDefinition<GenericSchema, boolean>;

const modules: ConvexTestModules = import.meta.glob("./component/**/*.*s");

for (const path of Object.keys(modules)) {
  if (
    path.endsWith(".test.ts") ||
    path.endsWith(".vitest.ts") ||
    path.endsWith("/convex.config.ts") ||
    path.endsWith("/schema.ts")
  ) {
    delete modules[path];
  }
}

/**
 * Registers the `convexAuth` component (schema + function modules) into a
 * `convex-test` harness. Call it on the object returned by `convexTest`.
 *
 * The component installs children (`rateLimiter`, `mcpOauth` as `mcp`) via
 * `component.use`; they are not registered here. Any code path that calls
 * `components.rateLimiter` or `components.mcp` also needs those components
 * registered through their own package test entries.
 */
export function register(
  test: {
    registerComponent: (name: string, schema: ComponentSchema, modules: ConvexTestModules) => void;
  },
  name = "convexAuth",
) {
  test.registerComponent(name, schema, modules);
}

const convexAuthTest = { register, schema, modules };

export default convexAuthTest;
export { modules, schema };
