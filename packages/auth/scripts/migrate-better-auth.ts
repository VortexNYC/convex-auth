#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const LEGACY_PACKAGE = "@convex-dev/better-auth";
const VENDORED_PACKAGE = "convex-auth";
const LEGACY_PACKAGES = [
  "better-auth",
  "@better-auth/expo",
  "@convex-dev/better-auth",
  "convex-better-auth",
  "convex-better-auth-adapter",
];

type MigrateArgs = {
  convexDir: string;
  legacyComponent: string;
  authComponent: string;
  dryRun: boolean;
  cutover: boolean;
  resume: boolean;
  batchSize: number;
  help: boolean;
};

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function warn(message: string): void {
  process.stderr.write(`[warn] ${message}\n`);
}

function run(command: string, args: string[], options?: { cwd?: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      cwd: options?.cwd,
      env: process.env,
    });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited ${code}`)),
    );
    child.on("error", (err) => reject(err));
  });
}

function runWithOutput(
  command: string,
  args: string[],
  options?: { cwd?: string },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: options?.cwd,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (data) => {
      stdout += String(data);
    });
    child.stderr?.on("data", (data) => {
      stderr += String(data);
    });
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`${command} ${args.join(" ")} exited ${code}: ${stderr || stdout}`));
      } else {
        resolve(stdout);
      }
    });
    child.on("error", (err) => reject(err));
  });
}

function detectPackageManager(cwd: string): string {
  if (existsSync(resolve(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(resolve(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(resolve(cwd, "package-lock.json"))) return "npm";
  return "pnpm";
}

export function swapPackageInPackageJson(content: string): string {
  return content.replace(new RegExp(`"${LEGACY_PACKAGE}"`, "g"), `"${VENDORED_PACKAGE}"`);
}

export function swapPackageInConvexConfig(content: string): string {
  const escaped = LEGACY_PACKAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return content
    .replace(
      new RegExp(`from "${escaped}/convex.config"`, "g"),
      `from "${VENDORED_PACKAGE}/convex.config"`,
    )
    .replace(
      new RegExp(`from '${escaped}/convex.config'`, "g"),
      `from '${VENDORED_PACKAGE}/convex.config'`,
    )
    .replace(
      new RegExp(`from "${escaped}/convex.config.js"`, "g"),
      `from "${VENDORED_PACKAGE}/convex.config.js"`,
    )
    .replace(
      new RegExp(`from '${escaped}/convex.config.js'`, "g"),
      `from '${VENDORED_PACKAGE}/convex.config.js'`,
    );
}

export function removeLegacyFromConvexConfig(content: string): string {
  const legacyImports = new Set<string>();
  for (const pkg of [...LEGACY_PACKAGES, VENDORED_PACKAGE]) {
    const regex = new RegExp(
      `^\\s*import\\s+(\\w+)\\s+from\\s+["']${pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/convex\\.config(?:\\.js)?["'];?\\s*$`,
      "gm",
    );
    let match;
    while ((match = regex.exec(content)) !== null) {
      legacyImports.add(match[1]);
    }
  }
  let result = content;
  for (const pkg of [...LEGACY_PACKAGES, VENDORED_PACKAGE]) {
    const regex = new RegExp(
      `^\\s*import\\s+\\w+\\s+from\\s+["']${pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/convex\\.config(?:\\.js)?["'];?[ \\t]*(?:\\r?\\n)?`,
      "gm",
    );
    result = result.replace(regex, "");
  }
  for (const name of legacyImports) {
    const regex = new RegExp(
      `^\\s*app\\.use\\s*\\(\\s*${name}\\s*[^)]*\\)\\s*;?[ \\t]*(?:\\r?\\n)?`,
      "gm",
    );
    result = result.replace(regex, "");
  }
  // collapse multiple blank lines left behind
  return result.replace(/\n{3,}/g, "\n\n");
}

export function rewriteHttpToNative(content: string): string | null {
  const bridgePattern = /createBetterAuthConvexRuntime|createClient\s*\(|registerRoutes\(/;
  if (!bridgePattern.test(content)) return null;
  if (content.includes("auth.addHttpRoutes")) return content;
  return `import { auth } from "./auth";
import { httpRouter } from "convex/server";

const http = httpRouter();
auth.addHttpRoutes(http);

export default http;
`;
}

export function rewriteAuthToNative(content: string): string | null {
  if (content.includes("convex-auth/convex") && content.includes("convexAuth(")) {
    return content;
  }
  if (
    !content.includes("createBetterAuth") &&
    !content.includes("@convex-dev/better-auth/convex") &&
    !content.includes("convex-better-auth/convex") &&
    !content.includes("convex-better-auth-adapter/convex")
  ) {
    return null;
  }
  return `import { convexAuth } from "convex-auth/convex";
import { components } from "./_generated/api.js";

export const auth = convexAuth({
  component: components.convexAuth,
});
`;
}

export function presentLegacyPackages(packageJson: string): string[] {
  const present: string[] = [];
  for (const pkg of LEGACY_PACKAGES) {
    const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`"${escaped}":`);
    if (regex.test(packageJson)) present.push(pkg);
  }
  return present;
}

export function parseArgs(argv: string[]): MigrateArgs {
  const args = argv.slice(2);
  let convexDir = "./convex";
  let legacyComponent = "betterAuth";
  let authComponent = "convexAuth";
  let dryRun = false;
  let cutover = false;
  let resume = false;
  let batchSize = 100;
  let help = false;
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--convex-dir":
        convexDir = args[++i] ?? convexDir;
        break;
      case "--from-component":
        legacyComponent = args[++i] ?? legacyComponent;
        break;
      case "--auth-component":
        authComponent = args[++i] ?? authComponent;
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--cutover":
        cutover = true;
        break;
      case "--resume":
        resume = true;
        break;
      case "--batch-size":
        batchSize = Number.parseInt(args[++i] ?? "100", 10);
        if (Number.isNaN(batchSize) || batchSize <= 0) {
          throw new Error("--batch-size must be a positive integer");
        }
        break;
      case "--help":
      case "-h":
        help = true;
        break;
    }
  }
  return { convexDir, legacyComponent, authComponent, dryRun, cutover, resume, batchSize, help };
}

function printMigrateHelp(): void {
  log(
    "migrate better-auth — one-time migration from Better Auth to convex-auth\n\n" +
      "Usage:\n" +
      "  pnpm dlx convex-auth migrate better-auth [options]\n\n" +
      "Options:\n" +
      "  --dry-run              Print the plan and legacy table counts without changing anything\n" +
      "  --cutover              After migration, rewrite files and remove legacy packages\n" +
      "  --resume               Continue a previously started migration\n" +
      "  --from-component <n>   Legacy component mount name (default: betterAuth)\n" +
      "  --auth-component <n>   convex-auth component mount name (default: convexAuth)\n" +
      "  --batch-size <n>       Migration batch size (default: 100)\n" +
      "  --convex-dir <path>    Path to convex directory (default: ./convex)\n" +
      "  --help, -h             Print this help\n",
  );
}

function rewriteFile(
  path: string,
  transform: (s: string) => string | null,
  dryRun: boolean,
): boolean {
  if (!existsSync(path)) return false;
  const before = readFileSync(path, "utf8");
  const after = transform(before);
  if (after === null) {
    warn(`could not confidently rewrite ${path}; leaving as-is`);
    return false;
  }
  if (before === after) return false;
  if (dryRun) {
    log(`[dry-run] would rewrite ${path}`);
    return true;
  }
  writeFileSync(path, after);
  log(`rewrote ${path}`);
  return true;
}

async function runConvex(args: string[], dryRun: boolean, cwd: string): Promise<void> {
  if (dryRun) {
    log(`[dry-run] would run: pnpm dlx convex ${args.join(" ")}`);
    return;
  }
  return run("pnpm", ["dlx", "convex", ...args], { cwd });
}

async function runConvexJson<T>(args: string[], cwd: string): Promise<T> {
  const out = await runWithOutput("pnpm", ["dlx", "convex", ...args], { cwd });
  return JSON.parse(out.trim()) as T;
}

function hasConvexAuth(convexConfig: string): boolean {
  return /convex-auth\/convex\.config(?:\.js)?/.test(convexConfig);
}

export async function main(argv: string[]): Promise<void> {
  const cwd = process.cwd();
  const { convexDir, legacyComponent, authComponent, dryRun, cutover, resume, batchSize, help } =
    parseArgs(argv);

  if (help) {
    printMigrateHelp();
    return;
  }

  const packageJsonPath = resolve(cwd, "package.json");
  const convexConfigPath = resolve(cwd, convexDir, "convex.config.ts");

  if (!existsSync(packageJsonPath)) throw new Error(`package.json not found at ${packageJsonPath}`);
  if (!existsSync(convexConfigPath))
    throw new Error(`convex.config.ts not found at ${convexConfigPath}`);

  const convexConfig = readFileSync(convexConfigPath, "utf8");
  if (!hasConvexAuth(convexConfig)) {
    throw new Error(
      `convex-auth component is not mounted in ${convexConfigPath}; mount it before migrating`,
    );
  }

  const packageJson = readFileSync(packageJsonPath, "utf8");
  if (!packageJson.includes(LEGACY_PACKAGE) && !packageJson.includes(VENDORED_PACKAGE)) {
    throw new Error(`Neither ${LEGACY_PACKAGE} nor ${VENDORED_PACKAGE} found in package.json`);
  }

  log("Better Auth to convex-auth migration");
  log(`  package.json:  ${packageJsonPath}`);
  log(`  convex dir:    ${convexDir}`);
  log(`  legacy comp:   ${legacyComponent}`);
  log(`  auth comp:     ${authComponent}`);
  if (dryRun) log("  --dry-run: no files or deployments will change");
  if (resume) log("  --resume: migration will continue from the stored cursor");
  log(`  batch size:    ${batchSize}`);

  const needsSwap = packageJson.includes(LEGACY_PACKAGE);
  if (dryRun) {
    log("\n[dry-run] planned steps:");
    if (needsSwap) {
      log(`  1. rewrite package.json: ${LEGACY_PACKAGE} -> ${VENDORED_PACKAGE}`);
      log(`  2. rewrite ${convexDir}/convex.config.ts to import ${VENDORED_PACKAGE}`);
      log(`  3. ${detectPackageManager(cwd)} install and pnpm dlx convex dev --once`);
    } else {
      log(`  1. use existing ${VENDORED_PACKAGE}`);
    }
    log(`  2. fetch migration function handles from ${authComponent}`);
    log(`  3. run ${legacyComponent}/migrate:setMigrationTargets`);
    log(`  4. run ${legacyComponent}/migrate:migrateAll (batch size ${batchSize})`);
    if (cutover) {
      log(`  5. rewrite ${convexDir}/convex.config.ts, ${convexDir}/http.ts, and package.json`);
      log(`  6. remove legacy packages and deploy native convex-auth`);
    }

    try {
      const counts = await runConvexJson<{
        users: number;
        accounts: number;
        sessions: number;
      }>(["run", "--component", legacyComponent, "migrate:getLegacyCounts", "{}"], cwd);
      log(`\nlegacy table counts in ${legacyComponent}:`);
      log(`  users:    ${counts.users}`);
      log(`  accounts: ${counts.accounts}`);
      log(`  sessions: ${counts.sessions}`);
    } catch {
      warn(
        "could not fetch legacy table counts; the legacy component may not expose migrate:getLegacyCounts",
      );
    }
    log("\n[dry-run] no changes made");
    return;
  }

  if (needsSwap) {
    log(`\nswapping ${LEGACY_PACKAGE} → ${VENDORED_PACKAGE}...`);
    rewriteFile(packageJsonPath, swapPackageInPackageJson, false);
    rewriteFile(convexConfigPath, swapPackageInConvexConfig, false);
    const pkg = detectPackageManager(cwd);
    log(`running ${pkg} install...`);
    await run(pkg, ["install"], { cwd });
    log("deploying vendored adapter...");
    await runConvex(["dev", "--once"], false, cwd);
  } else {
    log(`\nusing existing ${VENDORED_PACKAGE}...`);
    log("deploying...");
    await runConvex(["dev", "--once"], false, cwd);
  }

  log("\nfetching migration function handles...");
  const handles = await runConvexJson<{
    migrateUser: string;
    migrateAccount: string;
    migrateSession: string;
  }>(["run", "--component", authComponent, "migrate:getMigrationFunctionHandles", "{}"], cwd);

  log("setting migration targets on legacy component...");
  await runConvexJson<Record<string, never>>(
    [
      "run",
      "--component",
      legacyComponent,
      "migrate:setMigrationTargets",
      JSON.stringify({
        migrateUserHandle: handles.migrateUser,
        migrateAccountHandle: handles.migrateAccount,
        migrateSessionHandle: handles.migrateSession,
      }),
    ],
    cwd,
  );

  log("running migration...");
  const migrateArgs: { batchSize: number; reset?: boolean } = { batchSize };
  if (!resume) {
    migrateArgs.reset = true;
  }
  const status = await runConvexJson<{
    name?: string;
    isDone?: boolean;
    processed?: number;
    continueCursor?: string | null;
  }>(
    ["run", "--component", legacyComponent, "migrate:migrateAll", JSON.stringify(migrateArgs)],
    cwd,
  );
  log(`migration status: ${JSON.stringify(status)}`);

  if (cutover) {
    const httpTsPath = resolve(cwd, convexDir, "http.ts");
    const authTsPath = resolve(cwd, convexDir, "auth.ts");
    const rootDir = resolve(cwd, convexDir, "..");

    log("\ncutover: removing legacy component and packages...");
    rewriteFile(convexConfigPath, removeLegacyFromConvexConfig, false);
    rewriteFile(httpTsPath, rewriteHttpToNative, false);
    rewriteFile(authTsPath, rewriteAuthToNative, false);

    const pkg = detectPackageManager(cwd);
    const toRemove = presentLegacyPackages(readFileSync(packageJsonPath, "utf8"));
    if (toRemove.length > 0) {
      log(`removing packages: ${toRemove.join(", ")}`);
      await run(pkg, ["remove", ...toRemove], { cwd });
    }
    log("deploying native convex-auth...");
    await runConvex(["dev", "--once"], false, cwd);

    const reactFiles = ["src/main.tsx", "src/App.tsx", "src/main.jsx", "src/App.jsx"];
    for (const file of reactFiles) {
      const path = resolve(rootDir, file);
      if (existsSync(path)) {
        const content = readFileSync(path, "utf8");
        if (/(better-auth|@convex-dev\/better-auth|convex-better-auth)/.test(content)) {
          warn(
            `${path} still references Better Auth; review and rewrite to convex-auth/react manually`,
          );
        }
      }
    }
  }

  log("\ndone");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv).catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
}
