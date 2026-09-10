import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { formatAuthPreflightResult, runAuthPreflight, type AuthPreflightCheck } from "./preflight";

const DEFAULT_CONVEX_RUNTIME_TIMEOUT_MS = 15000;
const DEFAULT_AUTH_RUNTIME_TIMEOUT_MS = 15000;
const DEFAULT_POLL_INTERVAL_MS = 100;
const DEFAULT_TEST_BASE_URL = "http://127.0.0.1:4173";
const DEFAULT_PACKAGE_NAME = "@vortex-api/convex-auth";
const DEFAULT_WEB_PACKAGE_JSON_CANDIDATES = [
  "apps/web/package.json",
  "examples/react/package.json",
  "web/package.json",
  "package.json",
];
const DEFAULT_SIGN_IN_PATH = "/sign-in";
const DEFAULT_SIGN_IN_URL_PATTERN = /\/sign-in(?:\/|$|\?)/;
const DEFAULT_EMAIL_INPUT_SELECTOR =
  'input[type="email"], input[name="identifier"], input[name="emailAddress"]';
const DEFAULT_PASSWORD_INPUT_SELECTOR = 'input[type="password"]';
const DEFAULT_SIGN_IN_BUTTON_NAME = /continue|sign in/i;

export type ConvexAuthTestingPage = {
  evaluate<T, TArg>(pageFunction: (arg: TArg) => T | Promise<T>, arg: TArg): Promise<T>;
};

export type ConvexAuthTestingLocator = {
  first(): ConvexAuthTestingLocator;
  fill(value: string): Promise<void>;
  click(): Promise<void>;
};

export type ConvexAuthTestingPageWithUi = {
  goto(
    url: string,
    options?: {
      waitUntil?: "commit" | "domcontentloaded" | "load" | "networkidle";
    },
  ): Promise<unknown>;
  getByRole(role: "button", options: { name: string | RegExp }): ConvexAuthTestingLocator;
  locator(selector: string): ConvexAuthTestingLocator;
  url(): string;
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<unknown>;
  waitForURL(
    url: string | RegExp,
    options?: {
      timeout?: number;
      waitUntil?: "commit" | "domcontentloaded" | "load" | "networkidle";
    },
  ): Promise<unknown>;
};

export type WaitForExposedConvexRuntimeOptions = {
  timeoutMs?: number;
  pollIntervalMs?: number;
};

export type ConvexAuthTestingEnv = Record<string, string | undefined>;

export type ConvexAuthTestCredentials = {
  email: string;
  password: string;
};

export type ConvexAuthTestCredentialsOptions = {
  env?: ConvexAuthTestingEnv;
  emailEnvName?: string;
  passwordEnvName?: string;
};

export type ConvexAuthE2EEnvironmentOptions = ConvexAuthTestCredentialsOptions & {
  scope?: string;
  baseUrlEnvName?: string;
  defaultBaseUrl?: string;
  convexUrlEnvName?: string;
  logger?: (message: string) => void;
};

export type ConvexAuthPreflightCommandOptions = {
  repoRoot: string;
  backendSetup?: false | ConvexAuthPreflightBackendSetupOptions;
  commandArgs?: string[];
  env?: NodeJS.ProcessEnv;
  logger?: (message: string) => void;
  fetchImpl?: typeof fetch;
  packageName?: string;
  testEnvPath?: string;
  rootPackageJsonPath?: string;
  webPackageJsonPath?: string;
  installedPackageJsonPath?: string;
  convexUrlEnvNames?: string[];
  appBaseUrlEnvNames?: string[];
  appServerProbePaths?: string[];
  extraCheckFactory?: (args: {
    appBaseUrl: string | undefined;
    convexUrl: string | undefined;
    env: NodeJS.ProcessEnv;
    backendSetup: ConvexAuthPreflightBackendSetup | undefined;
  }) => AuthPreflightCheck[] | Promise<AuthPreflightCheck[]>;
};

export type ConvexAuthPreflightBackendSetupOptions = {
  authConfigPath?: string;
  convexConfigPath?: string;
  httpPath?: string;
};

export type ConvexAuthPreflightBackendSetup = {
  files: {
    name: string;
    path: string;
    content: string | null;
    requiredSnippets: string[];
  }[];
  envGroups: {
    name: string;
    envNames: string[];
    values: NodeJS.ProcessEnv;
  }[];
};

export type SignInWithConvexAuthEmailPasswordOptions = ConvexAuthTestCredentialsOptions & {
  afterSignInPathPattern?: RegExp;
  credentials?: ConvexAuthTestCredentials;
  emailInputSelector?: string;
  passwordInputSelector?: string;
  readFailureMessage?: (page: ConvexAuthTestingPageWithUi) => Promise<string | null>;
  signInButtonName?: string | RegExp;
  signInPath?: string;
  signInUrlPattern?: RegExp;
  timeoutMs?: number;
};

type ConvexAuthTestingRuntime = {
  __convexApi?: unknown;
  __convexClient?: unknown;
};

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  version?: string;
};

let hasLoggedE2EEnvironment = false;

export function hasConvexAuthTestCredentials(options: ConvexAuthTestCredentialsOptions = {}) {
  const env = options.env ?? process.env;
  const emailEnvName = options.emailEnvName ?? "TEST_USER_EMAIL";
  const passwordEnvName = options.passwordEnvName ?? "TEST_USER_PASSWORD";

  return Boolean(env[emailEnvName]?.trim() && env[passwordEnvName]?.trim());
}

export function getConvexAuthTestCredentials(
  options: ConvexAuthTestCredentialsOptions = {},
): ConvexAuthTestCredentials {
  const env = options.env ?? process.env;
  const emailEnvName = options.emailEnvName ?? "TEST_USER_EMAIL";
  const passwordEnvName = options.passwordEnvName ?? "TEST_USER_PASSWORD";
  const email = env[emailEnvName]?.trim();
  const password = env[passwordEnvName]?.trim();

  if (!email || !password) {
    throw new Error(`${emailEnvName} and ${passwordEnvName} must be set for auth E2E tests.`);
  }

  return { email, password };
}

export function assertConvexAuthAppEnv(options: ConvexAuthE2EEnvironmentOptions = {}) {
  const env = options.env ?? process.env;
  const baseUrlEnvName = options.baseUrlEnvName ?? "PLAYWRIGHT_TEST_BASE_URL";
  const baseUrl = env[baseUrlEnvName]?.trim() || options.defaultBaseUrl || DEFAULT_TEST_BASE_URL;

  if (!baseUrl.trim()) {
    throw new Error(`[E2E preflight] Missing ${baseUrlEnvName} for app setup`);
  }

  logConvexAuthE2EEnvironment({
    ...options,
    env,
    scope: options.scope ?? "app",
  });
}

export function assertConvexAuthCredentialsEnv(options: ConvexAuthE2EEnvironmentOptions = {}) {
  getConvexAuthTestCredentials(options);
  logConvexAuthE2EEnvironment({
    ...options,
    scope: options.scope ?? "auth",
  });
}

export function logConvexAuthE2EEnvironment(options: ConvexAuthE2EEnvironmentOptions = {}) {
  if (hasLoggedE2EEnvironment) {
    return;
  }

  const environment = resolveConvexAuthE2EEnvironment(options);
  const logger = options.logger ?? console.info;

  logger(`[setup:${environment.scope}] Base URL: ${environment.baseUrl}`);
  logger(`[setup:${environment.scope}] Convex URL: ${environment.convexUrl}`);
  logger(`[setup:${environment.scope}] Auth test user: ${environment.authEmail}`);

  hasLoggedE2EEnvironment = true;
}

function resolveConvexAuthE2EEnvironment(options: ConvexAuthE2EEnvironmentOptions) {
  const env = options.env ?? process.env;
  const scope = options.scope ?? "app";
  const baseUrlEnvName = options.baseUrlEnvName ?? "PLAYWRIGHT_TEST_BASE_URL";
  const emailEnvName = options.emailEnvName ?? "TEST_USER_EMAIL";
  const convexUrlEnvName = options.convexUrlEnvName ?? "VITE_CONVEX_URL";
  const baseUrl = env[baseUrlEnvName]?.trim() || options.defaultBaseUrl || DEFAULT_TEST_BASE_URL;
  const authEmail = env[emailEnvName]?.trim() || "<missing>";
  const convexUrl = env[convexUrlEnvName]?.trim() || "<missing>";
  return { authEmail, baseUrl, convexUrl, scope };
}

async function loadTestEnvIntoProcessEnv(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  testEnvPath?: string,
): Promise<void> {
  const resolvedPath = testEnvPath ?? resolve(repoRoot, ".test-env");
  if (!existsSync(resolvedPath)) {
    return;
  }
  const testEnv = await readEnvFile(resolvedPath);
  for (const [key, value] of Object.entries(testEnv)) {
    env[key] ??= value;
  }
}

function expectedPreflightPackageVersion(
  packageName: string,
  rootPackageJson: PackageJson,
  webPackageJson: PackageJson,
): string | null {
  return (
    webPackageJson.dependencies?.[packageName] ??
    webPackageJson.devDependencies?.[packageName] ??
    rootPackageJson.dependencies?.[packageName] ??
    rootPackageJson.devDependencies?.[packageName] ??
    null
  );
}

function resolvePreflightUrls(env: NodeJS.ProcessEnv, options: ConvexAuthPreflightCommandOptions) {
  return {
    appBaseUrl: firstEnvValue(
      env,
      options.appBaseUrlEnvNames ?? ["PLAYWRIGHT_TEST_BASE_URL", "TEST_WEB_URL"],
    ),
    convexUrl: firstEnvValue(env, options.convexUrlEnvNames ?? ["VITE_CONVEX_URL", "CONVEX_URL"]),
  };
}

export async function runConvexAuthPreflightCommand(options: ConvexAuthPreflightCommandOptions) {
  const env = options.env ?? process.env;
  const logger = options.logger ?? console.info;
  const packageName = options.packageName ?? DEFAULT_PACKAGE_NAME;

  await loadTestEnvIntoProcessEnv(options.repoRoot, env, options.testEnvPath);

  const rootPackageJson = await readPackageJson(
    options.rootPackageJsonPath ?? resolve(options.repoRoot, "package.json"),
  );
  const webPackageJson = await findWebPackageJson(options.repoRoot, options.webPackageJsonPath);
  const installedPackageJson = await readPackageJson(
    options.installedPackageJsonPath ??
      resolve(options.repoRoot, "node_modules", ...packageName.split("/"), "package.json"),
  );

  const expectedPackageVersion = expectedPreflightPackageVersion(
    packageName,
    rootPackageJson,
    webPackageJson,
  );
  const { appBaseUrl, convexUrl } = resolvePreflightUrls(env, options);
  const backendSetup =
    options.backendSetup === false
      ? undefined
      : await readBackendSetup(options.repoRoot, env, options.backendSetup);
  const extraChecks =
    options.backendSetup === false || !options.extraCheckFactory
      ? undefined
      : await options.extraCheckFactory({
          appBaseUrl,
          convexUrl,
          env,
          backendSetup,
        });

  const result = await runAuthPreflight({
    actualPackageVersion: installedPackageJson.version ?? null,
    appServer: {
      baseUrl: appBaseUrl,
      expectedValues: [convexUrl].filter((value): value is string => Boolean(value)),
      probePaths: options.appServerProbePaths,
    },
    backendSetup,
    convexUrl,
    expectedPackageVersion,
    fetchImpl: options.fetchImpl,
    extraChecks,
  });

  logger(formatAuthPreflightResult(result));
  if (!result.ok) {
    return 1;
  }

  const commandArgs = options.commandArgs ?? [];
  if (commandArgs.length === 0) {
    return 0;
  }

  return await runCommand(options.repoRoot, env, commandArgs);
}

export async function signInWithConvexAuthEmailPassword(
  page: ConvexAuthTestingPageWithUi,
  options: SignInWithConvexAuthEmailPasswordOptions = {},
) {
  const credentials = options.credentials ?? getConvexAuthTestCredentials(options);
  const timeoutMs = options.timeoutMs ?? DEFAULT_AUTH_RUNTIME_TIMEOUT_MS;
  const emailInputSelector = options.emailInputSelector ?? DEFAULT_EMAIL_INPUT_SELECTOR;
  const passwordInputSelector = options.passwordInputSelector ?? DEFAULT_PASSWORD_INPUT_SELECTOR;

  await page.goto(options.signInPath ?? DEFAULT_SIGN_IN_PATH, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForURL(options.signInUrlPattern ?? DEFAULT_SIGN_IN_URL_PATTERN, {
    timeout: timeoutMs,
  });
  await page.waitForSelector(emailInputSelector, { timeout: timeoutMs });
  await page.waitForSelector(passwordInputSelector, { timeout: timeoutMs });

  await page.locator(emailInputSelector).first().fill(credentials.email);
  await page.locator(passwordInputSelector).first().fill(credentials.password);
  await page
    .getByRole("button", {
      name: options.signInButtonName ?? DEFAULT_SIGN_IN_BUTTON_NAME,
    })
    .click();

  try {
    await waitForConvexAuthSignedInPath(page, {
      afterSignInPathPattern: options.afterSignInPathPattern,
      timeoutMs,
    });
  } catch (error) {
    const failureMessage = await options.readFailureMessage?.(page);
    const suffix = failureMessage ? `: ${failureMessage}` : "";
    throw new Error(`${error instanceof Error ? error.message : String(error)}${suffix}`, {
      cause: error,
    });
  }
}

export async function waitForExposedConvexRuntime(
  page: ConvexAuthTestingPage,
  options: WaitForExposedConvexRuntimeOptions = {},
) {
  await pollUntil(
    async () =>
      await page.evaluate(() => {
        const runtime = window as typeof window & ConvexAuthTestingRuntime;
        return Boolean(runtime.__convexApi && runtime.__convexClient);
      }, undefined),
    (isReady): isReady is true => isReady,
    {
      timeoutMs: options.timeoutMs ?? DEFAULT_CONVEX_RUNTIME_TIMEOUT_MS,
      pollIntervalMs: options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      errorMessage: "Convex runtime was not exposed before the readiness timeout.",
    },
  );
}

async function waitForConvexAuthSignedInPath(
  page: ConvexAuthTestingPageWithUi,
  options: {
    afterSignInPathPattern?: RegExp;
    timeoutMs: number;
  },
) {
  const afterSignInPathPattern = options.afterSignInPathPattern;
  await pollUntil(
    async () => {
      const pathname = new URL(page.url()).pathname;
      if (afterSignInPathPattern) {
        return afterSignInPathPattern.test(pathname);
      }

      return pathname !== "/sign-in" && pathname !== "/sign-up";
    },
    (isReady): isReady is true => isReady,
    {
      timeoutMs: options.timeoutMs,
      pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
      errorMessage: "Sign-in did not leave the auth route before the readiness timeout.",
    },
  );
}

async function readEnvFile(path: string) {
  const content = await readFile(path, "utf8");
  const values: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    values[trimmed.slice(0, separatorIndex)] = trimmed.slice(separatorIndex + 1);
  }

  return values;
}

async function readBackendSetup(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  options: ConvexAuthPreflightBackendSetupOptions = {},
): Promise<ConvexAuthPreflightBackendSetup> {
  const convexConfigPath = options.convexConfigPath ?? "convex/convex.config.ts";
  const authConfigPath = options.authConfigPath ?? "convex/auth.config.ts";
  const httpPath = options.httpPath ?? "convex/http.ts";

  return {
    files: [
      {
        name: "Convex Auth component registration",
        path: convexConfigPath,
        content: await readOptionalText(resolve(repoRoot, convexConfigPath)),
        requiredSnippets: ["@vortex-api/convex-auth/convex.config", "app.use"],
      },
      {
        name: "Convex auth config",
        path: authConfigPath,
        content: await readOptionalText(resolve(repoRoot, authConfigPath)),
        requiredSnippets: ["convexAuth", 'from "@vortex-api/convex-auth/convex"'],
      },
      {
        name: "Convex HTTP auth routes",
        path: httpPath,
        content: await readOptionalText(resolve(repoRoot, httpPath)),
        requiredSnippets: ["httpRouter", "auth.addHttpRoutes"],
      },
    ],
    envGroups: [
      {
        name: "Backend Convex auth site URL",
        envNames: ["CONVEX_SITE_URL"],
        values: env,
      },
      {
        name: "Convex auth signing keys",
        envNames: ["JWT_PRIVATE_KEY", "JWKS"],
        values: env,
      },
    ],
  };
}

export function readOrigin(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

async function readOptionalText(path: string) {
  if (!existsSync(path)) {
    return null;
  }

  return await readFile(path, "utf8");
}

async function readPackageJson(path: string): Promise<PackageJson> {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`Expected ${path} to contain a JSON object`);
  }
  return {
    dependencies: readStringRecord(Reflect.get(value, "dependencies")),
    devDependencies: readStringRecord(Reflect.get(value, "devDependencies")),
    version:
      typeof Reflect.get(value, "version") === "string" ? Reflect.get(value, "version") : undefined,
  };
}

async function findWebPackageJson(repoRoot: string, explicitPath?: string): Promise<PackageJson> {
  if (explicitPath) {
    return readPackageJson(explicitPath);
  }
  for (const candidate of DEFAULT_WEB_PACKAGE_JSON_CANDIDATES) {
    const path = resolve(repoRoot, candidate);
    if (existsSync(path)) {
      return readPackageJson(path);
    }
  }
  return {};
}

function readStringRecord(value: unknown): Record<string, string> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value);
  return entries.every((entry) => typeof entry[1] === "string")
    ? Object.fromEntries(entries)
    : undefined;
}

async function runCommand(repoRoot: string, env: NodeJS.ProcessEnv, commandArgs: string[]) {
  const [command, ...args] = commandArgs;
  if (!command) {
    return 0;
  }

  const child = spawn(command, args, {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });

  return await new Promise<number>((resolveExitCode) => {
    child.on("close", (code) => {
      resolveExitCode(code ?? 1);
    });
  });
}

export function firstEnvValue(env: ConvexAuthTestingEnv, names: string[]) {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

async function pollUntil<T, TAccepted extends T>(
  read: () => Promise<T>,
  accept: (value: T) => value is TAccepted,
  options: {
    timeoutMs: number;
    pollIntervalMs: number;
    errorMessage: string;
  },
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= options.timeoutMs) {
    const value = await read();
    if (accept(value)) {
      return value;
    }

    await sleep(options.pollIntervalMs);
  }

  throw new Error(options.errorMessage);
}

function sleep(durationMs: number) {
  return new Promise((fulfill) => {
    setTimeout(fulfill, durationMs);
  });
}
