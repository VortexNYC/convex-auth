#!/usr/bin/env node
/**
 * CLI wrapper for the Convex Auth install/runtime preflight.
 *
 * The implementation lives in `src/testing.ts`; the pack step bundles it in.
 */
import { resolve } from "node:path";

import {
  runConvexAuthPreflightCommand,
  type ConvexAuthPreflightBackendSetupOptions,
} from "../src/testing.ts";

type Args = {
  backendSetup?: false | ConvexAuthPreflightBackendSetupOptions;
  commandArgs: string[];
  installedPackageJsonPath?: string;
  packageName?: string;
  repoRoot: string;
  rootPackageJsonPath?: string;
  testEnvPath?: string;
  webPackageJsonPath?: string;
};

function printHelp(): void {
  process.stdout.write(
    "convex-auth preflight — install/runtime auth preflight\n\n" +
      "Usage:\n" +
      "  pnpm dlx @vortex-api/convex-auth preflight [options] [-- command...]\n\n" +
      "Options:\n" +
      "  --repo-root <path>              Consumer repo root. Default: .\n" +
      "  --convex-dir <path>             Convex dir containing auth files. Default: ./convex\n" +
      "  --package-name <name>           Auth package name. Default: convex-auth\n" +
      "  --test-env <path>               .test-env file path. Default: <repo-root>/.test-env\n" +
      "  --root-package-json <path>      Root package.json path.\n" +
      "  --web-package-json <path>       Web app package.json path.\n" +
      "  --installed-package-json <path> Installed auth package.json path.\n" +
      "  --skip-backend-setup            Skip Convex backend file signal checks.\n" +
      "  --help                          Print this help.\n\n" +
      "Examples:\n" +
      "  pnpm dlx @vortex-api/convex-auth preflight\n" +
      "  pnpm dlx @vortex-api/convex-auth preflight --repo-root . --convex-dir ./apps/backend/convex\n" +
      "  pnpm dlx @vortex-api/convex-auth preflight -- pnpm run test:e2e:prod-smoke\n",
  );
}

function readValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function backendSetupFromConvexDir(convexDir: string): ConvexAuthPreflightBackendSetupOptions {
  const base = convexDir.replace(/\/+$/, "");
  return {
    authConfigPath: `${base}/auth.ts`,
    convexConfigPath: `${base}/convex.config.ts`,
    httpPath: `${base}/http.ts`,
  };
}

function parseArgs(argv: readonly string[]): Args {
  let repoRoot = ".";
  let convexDir = "./convex";
  let packageName: string | undefined;
  let testEnvPath: string | undefined;
  let rootPackageJsonPath: string | undefined;
  let webPackageJsonPath: string | undefined;
  let installedPackageJsonPath: string | undefined;
  let skipBackendSetup = false;
  let commandArgs: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      commandArgs = argv.slice(index + 1);
      break;
    }

    switch (arg) {
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      case "--repo-root":
      case "--root":
        repoRoot = readValue(argv, index, arg);
        index += 1;
        break;
      case "--convex-dir":
        convexDir = readValue(argv, index, arg);
        index += 1;
        break;
      case "--package-name":
        packageName = readValue(argv, index, arg);
        index += 1;
        break;
      case "--test-env":
        testEnvPath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--root-package-json":
        rootPackageJsonPath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--web-package-json":
        webPackageJsonPath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--installed-package-json":
        installedPackageJsonPath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--skip-backend-setup":
        skipBackendSetup = true;
        break;
      default:
        throw new Error(`unknown option '${arg}'`);
    }
  }

  return {
    backendSetup: skipBackendSetup ? false : backendSetupFromConvexDir(convexDir),
    commandArgs,
    installedPackageJsonPath,
    packageName,
    repoRoot: resolve(repoRoot),
    rootPackageJsonPath,
    testEnvPath,
    webPackageJsonPath,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  process.exitCode = await runConvexAuthPreflightCommand({
    backendSetup: args.backendSetup,
    commandArgs: args.commandArgs,
    installedPackageJsonPath: args.installedPackageJsonPath,
    packageName: args.packageName,
    repoRoot: args.repoRoot,
    rootPackageJsonPath: args.rootPackageJsonPath,
    testEnvPath: args.testEnvPath,
    webPackageJsonPath: args.webPackageJsonPath,
  });
}

main().catch((error: unknown) => {
  process.stderr.write(
    `convex-auth preflight: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(2);
});
