import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it } from "vitest";

import {
  assertConvexAuthAppEnv,
  assertConvexAuthCredentialsEnv,
  getConvexAuthTestCredentials,
  hasConvexAuthTestCredentials,
  runConvexAuthPreflightCommand,
  signInWithConvexAuthEmailPassword,
  waitForExposedConvexRuntime,
  type ConvexAuthTestingLocator,
  type ConvexAuthTestingPage,
  type ConvexAuthTestingPageWithUi,
} from "./testing";

type TestRuntime = {
  __convexApi?: unknown;
  __convexClient?: unknown;
};

class RuntimePage implements ConvexAuthTestingPage {
  constructor(private readonly runtime: TestRuntime) {}

  async evaluate<T, TArg>(pageFunction: (arg: TArg) => T | Promise<T>, arg: TArg): Promise<T> {
    const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, "window");
    const previousWindow = Reflect.get(globalThis, "window");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: this.runtime,
    });

    try {
      return await pageFunction(arg);
    } finally {
      if (hadWindow) {
        Object.defineProperty(globalThis, "window", {
          configurable: true,
          value: previousWindow,
        });
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    }
  }
}

class FormLocator implements ConvexAuthTestingLocator {
  constructor(
    private readonly page: SignInPage,
    private readonly selector: string,
  ) {}

  first() {
    return this;
  }

  async fill(value: string) {
    this.page.values.set(this.selector, value);
  }

  async click() {
    this.page.clickedSubmit = true;
    this.page.currentUrl = "http://127.0.0.1:4173/app";
  }
}

class SignInPage implements ConvexAuthTestingPageWithUi {
  currentUrl = "http://127.0.0.1:4173/";
  clickedSubmit = false;
  readonly values = new Map<string, string>();

  async goto(url: string) {
    this.currentUrl = `http://127.0.0.1:4173${url}`;
  }

  getByRole() {
    return new FormLocator(this, "submit");
  }

  locator(selector: string) {
    return new FormLocator(this, selector);
  }

  url() {
    return this.currentUrl;
  }

  async waitForSelector() {}

  async waitForURL() {}
}

describe("testing helpers", () => {
  it("waits for exposed Convex runtime", async () => {
    const page = new RuntimePage({
      __convexApi: {},
      __convexClient: {},
    });

    await waitForExposedConvexRuntime(page, {
      timeoutMs: 1,
      pollIntervalMs: 1,
    });
  });

  it("reads test credentials from configurable env names", () => {
    const env = {
      AUTH_EMAIL: "person@example.com",
      AUTH_PASSWORD: "secret",
    };

    assert.equal(
      hasConvexAuthTestCredentials({
        env,
        emailEnvName: "AUTH_EMAIL",
        passwordEnvName: "AUTH_PASSWORD",
      }),
      true,
    );
    assert.deepEqual(
      getConvexAuthTestCredentials({
        env,
        emailEnvName: "AUTH_EMAIL",
        passwordEnvName: "AUTH_PASSWORD",
      }),
      { email: "person@example.com", password: "secret" },
    );
  });

  it("asserts and logs E2E environment once", () => {
    const lines: string[] = [];
    const env = {
      PLAYWRIGHT_TEST_BASE_URL: "http://127.0.0.1:4173",
      TEST_USER_EMAIL: "person@example.com",
      TEST_USER_PASSWORD: "secret",
      VITE_CONVEX_URL: "https://example.convex.cloud",
    };

    assertConvexAuthAppEnv({
      env,
      logger: (line) => lines.push(line),
      scope: "app",
    });
    assertConvexAuthCredentialsEnv({
      env,
      logger: (line) => lines.push(line),
      scope: "auth",
    });

    assert.deepEqual(lines, [
      "[setup:app] Base URL: http://127.0.0.1:4173",
      "[setup:app] Convex URL: https://example.convex.cloud",
      "[setup:app] Auth test user: person@example.com",
    ]);
  });

  it("fails auth preflight command when backend setup is missing", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "convex-auth-preflight-missing-"));
    await mkdir(join(repoRoot, "apps/web"), { recursive: true });
    await mkdir(join(repoRoot, "node_modules/@vortex-api/convex-auth"), {
      recursive: true,
    });
    await writeFile(
      join(repoRoot, "package.json"),
      JSON.stringify({ dependencies: { "@vortex-api/convex-auth": "0.1.25" } }),
    );
    await writeFile(join(repoRoot, "apps/web/package.json"), JSON.stringify({}));
    await writeFile(
      join(repoRoot, "node_modules/@vortex-api/convex-auth/package.json"),
      JSON.stringify({ version: "0.1.25" }),
    );
    await writeFile(
      join(repoRoot, ".test-env"),
      ["VITE_CONVEX_URL=https://convex.example.test"].join("\n"),
    );

    const lines: string[] = [];
    const exitCode = await runConvexAuthPreflightCommand({
      repoRoot,
      env: {},
      logger: (line) => lines.push(line),
      fetchImpl: async () => new Response("ok", { status: 200 }),
    });

    assert.equal(exitCode, 1);
    assert.equal(
      lines.some((line) => line.includes("[ERROR] Convex Auth component registration")),
      true,
    );
    assert.equal(
      lines.some((line) => line.includes("[ERROR] Backend Convex auth site URL")),
      true,
    );
  });

  it("signs in through legacy email password UI defaults", async () => {
    const page = new SignInPage();

    await signInWithConvexAuthEmailPassword(page, {
      credentials: {
        email: "person@example.com",
        password: "secret",
      },
    });

    assert.equal(page.clickedSubmit, true);
    assert.equal(
      page.values.get('input[type="email"], input[name="identifier"], input[name="emailAddress"]'),
      "person@example.com",
    );
    assert.equal(page.values.get('input[type="password"]'), "secret");
    assert.equal(new URL(page.url()).pathname, "/app");
  });
});
