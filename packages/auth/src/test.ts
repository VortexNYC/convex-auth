/// <reference types="vite/client" />

import schema from "./component/schema";

const modules = import.meta.glob("./component/**/*.*s");

type ComponentRegistrar = {
  registerComponent(name: string, registeredSchema: unknown, registeredModules: unknown): unknown;
};

const convexAuthTest = {
  schema,
  modules,
  register(t: ComponentRegistrar) {
    return t.registerComponent("convexAuth", schema, modules);
  },
};

export default convexAuthTest;
export { modules, schema };
