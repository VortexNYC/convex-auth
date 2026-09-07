import { describe, expect, it } from "vitest";
import {
  parseArgs,
  presentLegacyPackages,
  removeLegacyFromConvexConfig,
  rewriteAuthToNative,
  rewriteHttpToNative,
  swapPackageInConvexConfig,
  swapPackageInPackageJson,
} from "../../scripts/migrate-better-auth";

describe("parseArgs", () => {
  it("uses defaults", () => {
    expect(parseArgs(["node", "script", "migrate", "better-auth"])).toEqual({
      convexDir: "./convex",
      legacyComponent: "betterAuth",
      authComponent: "convexAuth",
      dryRun: false,
      cutover: false,
      resume: false,
      batchSize: 100,
      help: false,
    });
  });

  it("parses overrides", () => {
    expect(
      parseArgs([
        "node",
        "script",
        "migrate",
        "better-auth",
        "--convex-dir",
        "./apps/backend/convex",
        "--from-component",
        "betterAuthAdapter",
        "--auth-component",
        "auth",
        "--dry-run",
        "--cutover",
        "--resume",
        "--batch-size",
        "50",
      ]),
    ).toEqual({
      convexDir: "./apps/backend/convex",
      legacyComponent: "betterAuthAdapter",
      authComponent: "auth",
      dryRun: true,
      cutover: true,
      resume: true,
      batchSize: 50,
      help: false,
    });
  });
});

describe("swapPackageInPackageJson", () => {
  it("replaces @convex-dev/better-auth with the vendored adapter", () => {
    const input = `{\n  "dependencies": {\n    "@convex-dev/better-auth": "^0.12.0"\n  }\n}`;
    expect(swapPackageInPackageJson(input)).toBe(
      `{\n  "dependencies": {\n    "convex-better-auth-adapter": "^0.12.0"\n  }\n}`,
    );
  });
});

describe("swapPackageInConvexConfig", () => {
  it("rewrites the import source", () => {
    const input = `import betterAuth from "@convex-dev/better-auth/convex.config";
import auth from "convex-auth/convex.config";
`;
    expect(swapPackageInConvexConfig(input)).toBe(
      `import betterAuth from "convex-better-auth-adapter/convex.config";
import auth from "convex-auth/convex.config";
`,
    );
  });

  it("rewrites the .js variant", () => {
    const input = `import betterAuth from "@convex-dev/better-auth/convex.config.js";
`;
    expect(swapPackageInConvexConfig(input)).toBe(
      `import betterAuth from "convex-better-auth-adapter/convex.config.js";
`,
    );
  });
});

describe("removeLegacyFromConvexConfig", () => {
  it("removes the adapter import and app.use", () => {
    const input = `import { defineApp } from "convex/server";
import betterAuth from "convex-better-auth-adapter/convex.config";
import auth from "convex-auth/convex.config";

const app = defineApp();
app.use(betterAuth);
app.use(auth);

export default app;
`;
    expect(removeLegacyFromConvexConfig(input)).toBe(
      `import { defineApp } from "convex/server";
import auth from "convex-auth/convex.config";

const app = defineApp();
app.use(auth);

export default app;
`,
    );
  });

  it("removes @convex-dev/better-auth import and app.use with env", () => {
    const input = `import { defineApp } from "convex/server";
import betterAuth from "@convex-dev/better-auth/convex.config";
import auth from "convex-auth/convex.config";

const app = defineApp();
app.use(betterAuth, { env: { BETTER_AUTH_SECRET: app.env.BETTER_AUTH_SECRET } });
app.use(auth);

export default app;
`;
    expect(removeLegacyFromConvexConfig(input)).toBe(
      `import { defineApp } from "convex/server";
import auth from "convex-auth/convex.config";

const app = defineApp();
app.use(auth);

export default app;
`,
    );
  });
});

describe("rewriteHttpToNative", () => {
  it("rewrites a bridge http.ts", () => {
    const input = `import { createClient } from "convex-better-auth-adapter";
import { createBetterAuthConvexRuntime } from "convex-better-auth/convex";
import { httpRouter } from "convex/server";

const { registerRoutes } = createBetterAuthConvexRuntime({ ... });
const http = httpRouter();
registerRoutes(http);

export default http;
`;
    expect(rewriteHttpToNative(input)).toBe(`import { auth } from "./auth";
import { httpRouter } from "convex/server";

const http = httpRouter();
auth.addHttpRoutes(http);

export default http;
`);
  });

  it("returns null when no bridge pattern is detected", () => {
    const input = `import { httpRouter } from "convex/server";
const http = httpRouter();
http.route("/", ...);
export default http;
`;
    expect(rewriteHttpToNative(input)).toBeNull();
  });
});

describe("rewriteAuthToNative", () => {
  it("replaces a Better Auth bridge auth.ts with convex-auth", () => {
    const input = `import { createClient } from "convex-better-auth-adapter";
import { createBetterAuthConvexRuntime } from "convex-better-auth/convex";

export const { auth } = createBetterAuthConvexRuntime({ ... });
`;
    expect(rewriteAuthToNative(input)).toBe(`import { convexAuth } from "convex-auth/convex";
import { components } from "./_generated/api.js";

export const auth = convexAuth({
  component: components.convexAuth,
});
`);
  });

  it("leaves an already-native auth.ts alone", () => {
    const input = `import { convexAuth } from "convex-auth/convex";
import { components } from "./_generated/api.js";

export const auth = convexAuth({ component: components.convexAuth });
`;
    expect(rewriteAuthToNative(input)).toBe(input);
  });

  it("returns null when no bridge pattern is detected", () => {
    const input = `export const auth = {};
`;
    expect(rewriteAuthToNative(input)).toBeNull();
  });
});

describe("presentLegacyPackages", () => {
  it("finds installed legacy packages", () => {
    const input = JSON.stringify({
      dependencies: { "better-auth": "^1.7.0" },
      devDependencies: { "convex-better-auth-adapter": "^0.13.0" },
    });
    expect(presentLegacyPackages(input)).toEqual(["better-auth", "convex-better-auth-adapter"]);
  });
});
