#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const LEGACY_PACKAGE = "@convex-dev/better-auth";
const VENDORED_PACKAGE = "convex-better-auth-adapter";
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
      `^\\s*import\\s+\\w+\\s+from\\s+["']${pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/convex\\.config(?:\\.js)?["'];?\\s*(?:\\r?\\n)?`,
      "gm",
    );
    result = result.replace(regex, "");
  }
  for (const name of legacyImports) {
    const regex = new RegExp(
      `^\\s*app\\.use\\s*\\(\\s*${name}\\s*[^)]*\\)\\s*;?\\s*(?:\\r?\\n)?`,
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
    }
  }
  return { convexDir, legacyComponent, authComponent, dryRun, cutover, resume };
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

export async function main(argv: string[]): Promise<void> {
  const cwd = process.cwd();
  const { convexDir, legacyComponent, authComponent, dryRun, cutover, resume } = parseArgs(argv);

  const packageJsonPath = resolve(cwd, "package.json");
  const convexConfigPath = resolve(cwd, convexDir, "convex.config.ts");

  if (!existsSync(packageJsonPath)) throw new Error(`package.json not found at ${packageJsonPath}`);
  if (!existsSync(convexConfigPath))
    throw new Error(`convex.config.ts not found at ${convexConfigPath}`);

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
  if (resume) warn("  --resume: resuming is not yet implemented; starting from the beginning");

  const needsSwap = packageJson.includes(LEGACY_PACKAGE);
  if (needsSwap) {
    log(`\nswapping ${LEGACY_PACKAGE} → ${VENDORED_PACKAGE}...`);
    rewriteFile(packageJsonPath, swapPackageInPackageJson, dryRun);
    rewriteFile(convexConfigPath, swapPackageInConvexConfig, dryRun);
    if (!dryRun) {
      const pkg = detectPackageManager(cwd);
      log(`running ${pkg} install...`);
      await run(pkg, ["install"], { cwd });
      log("deploying vendored adapter...");
      await runConvex(["dev", "--once"], dryRun, cwd);
    }
  } else {
    log(`\nusing existing ${VENDORED_PACKAGE}...`);
    if (!dryRun) {
      log("deploying...");
      await runConvex(["dev", "--once"], dryRun, cwd);
    }
  }

  log("\nrunning direct migration...");

  if (dryRun) {
    log(`[dry-run] would fetch legacy users from ${legacyComponent}`);
  } else {
    const usersRaw = await runWithOutput(
      "pnpm",
      ["dlx", "convex", "run", "--component", legacyComponent, "migrate:getLegacyUsers", "{}"],
      { cwd },
    );
    const users = JSON.parse(usersRaw);
    const userMap = new Map<string, { userId: string; email: string; emailVerified: boolean }>();

    for (const legacyUser of users) {
      const key = legacyUser._id ?? legacyUser.userId ?? "";
      const args = JSON.stringify({ legacyUser });
      const result = await runWithOutput(
        "pnpm",
        ["dlx", "convex", "run", "--component", authComponent, "migrate:migrateUser", args],
        { cwd },
      );
      const { userId } = JSON.parse(result) as { userId: string };
      userMap.set(key, {
        userId,
        email: legacyUser.email,
        emailVerified: legacyUser.emailVerified,
      });
    }

    const accountsRaw = await runWithOutput(
      "pnpm",
      ["dlx", "convex", "run", "--component", legacyComponent, "migrate:getLegacyAccounts", "{}"],
      { cwd },
    );
    const accounts = JSON.parse(accountsRaw);
    let migratedAccounts = 0;
    for (const legacyAccount of accounts) {
      const info = userMap.get(legacyAccount.userId);
      if (info) {
        const args = JSON.stringify({
          legacyAccount,
          userId: info.userId,
          email: info.email,
          emailVerified: info.emailVerified,
        });
        await runWithOutput(
          "pnpm",
          ["dlx", "convex", "run", "--component", authComponent, "migrate:migrateAccount", args],
          { cwd },
        );
        migratedAccounts++;
      }
    }

    const sessionsRaw = await runWithOutput(
      "pnpm",
      ["dlx", "convex", "run", "--component", legacyComponent, "migrate:getLegacySessions", "{}"],
      { cwd },
    );
    const sessions = JSON.parse(sessionsRaw);
    let migratedSessions = 0;
    for (const legacySession of sessions) {
      const info = userMap.get(legacySession.userId);
      if (info) {
        const args = JSON.stringify({ legacySession, userId: info.userId });
        await runWithOutput(
          "pnpm",
          ["dlx", "convex", "run", "--component", authComponent, "migrate:migrateSession", args],
          { cwd },
        );
        migratedSessions++;
      }
    }

    log(
      `migrated ${users.length} users, ${migratedAccounts} accounts, ${migratedSessions} sessions`,
    );
  }

  if (cutover) {
    const httpTsPath = resolve(cwd, convexDir, "http.ts");
    const authTsPath = resolve(cwd, convexDir, "auth.ts");
    const rootDir = resolve(cwd, convexDir, "..");

    log("\ncutover: removing legacy component and packages...");
    rewriteFile(convexConfigPath, removeLegacyFromConvexConfig, dryRun);
    rewriteFile(httpTsPath, rewriteHttpToNative, dryRun);

    if (!dryRun) {
      const pkg = detectPackageManager(cwd);
      const toRemove = presentLegacyPackages(readFileSync(packageJsonPath, "utf8"));
      if (toRemove.length > 0) {
        log(`removing packages: ${toRemove.join(", ")}`);
        await run(pkg, ["remove", ...toRemove], { cwd });
      }
      log("deploying native convex-auth...");
      await runConvex(["dev", "--once"], dryRun, cwd);
    }

    if (existsSync(authTsPath)) {
      const authTs = readFileSync(authTsPath, "utf8");
      if (
        authTs.includes(LEGACY_PACKAGE) ||
        authTs.includes(VENDORED_PACKAGE) ||
        authTs.includes("createBetterAuth")
      ) {
        warn(
          `${authTsPath} still references Better Auth; review and rewrite to convex-auth/convex manually`,
        );
      }
    }

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
