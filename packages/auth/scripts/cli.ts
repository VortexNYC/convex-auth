#!/usr/bin/env node
/**
 * convex-auth CLI — the single entry point a consumer needs.
 *
 * Designed as the 'appliance' surface: a fresh consumer should never
 * type `node node_modules/@vortex-api/convex-auth/scripts/<long-path>.ts`.
 * Instead:
 *
 *   pnpm dlx @vortex-api/convex-auth check                # consumer-contract checker
 *   pnpm dlx @vortex-api/convex-auth check --convex-dir ./apps/backend/convex
 *   pnpm dlx @vortex-api/convex-auth preflight            # install/runtime preflight
 *   pnpm dlx @vortex-api/convex-auth migrate better-auth  # one-time migration from @convex-dev/better-auth
 *
 * Subcommands:
 *   check    Run the cold consumer-contract checker against ./convex
 *            (or --convex-dir). Catches local mirrors of org/member/
 *            role/invitation data the component owns.
 *   preflight
 *            Run the install/runtime preflight against the consumer repo.
 *   migrate better-auth
 *            Migrate legacy Better Auth data into convex-auth and cut over.
 *   help     Print this help.
 *
 * The CLI is intentionally minimal. Each subcommand is a thin wrapper
 * over a single existing script under `scripts/`. We do NOT bundle
 * orchestration logic here — every behavior is also reachable by
 * invoking the underlying script directly for advanced cases.
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const SCRIPT_EXTENSION = import.meta.url.endsWith(".ts") ? ".ts" : ".js";

function printHelp(): void {
  process.stdout.write(
    "convex-auth — Convex auth component CLI\n\n" +
      "Usage:\n" +
      "  pnpm dlx @vortex-api/convex-auth <command> [options]\n\n" +
      "Commands:\n" +
      "  check [--convex-dir <path>] [--legit-anchor-tables <a,b,c>]\n" +
      "    Run the consumer-contract checker (cold-runnable).\n" +
      "    Defaults: --convex-dir ./convex.\n" +
      "    Flags anti-patterns: local-bridge-mirror, local-mirror-write,\n" +
      "    bidirectional-mirror-writer. See docs/architecture/\n" +
      "    consumer-contract.md for remediation.\n\n" +
      "  preflight [--repo-root <path>] [--convex-dir <path>]\n" +
      "    Run the auth install/runtime preflight from the repo root.\n" +
      "    Defaults: --repo-root . and --convex-dir ./convex.\n" +
      "    Use -- after flags to run a command only after preflight passes.\n\n" +
      "  migrate better-auth [--dry-run] [--cutover] [--resume]\n" +
      "                      [--from-component <name>] [--auth-component <name>]\n" +
      "    One-time migration from @convex-dev/better-auth to convex-auth.\n" +
      "    --cutover rewrites convex.convex.config.ts/http.ts and removes legacy packages.\n\n" +
      "  help\n" +
      "    Print this help.\n\n" +
      "Why this CLI exists:\n" +
      "  Consumers used to type:\n" +
      "    node node_modules/@vortex-api/convex-auth/scripts/check-consumer-contract.ts \\\n" +
      "      --convex-dir ./apps/backend/convex\n" +
      "  Now:\n" +
      "    pnpm dlx @vortex-api/convex-auth check --convex-dir ./apps/backend/convex\n" +
      "    pnpm dlx @vortex-api/convex-auth preflight --repo-root . --convex-dir ./apps/backend/convex\n" +
      "    pnpm dlx @vortex-api/convex-auth migrate better-auth --dry-run\n",
  );
}

function runScript(script: string, args: readonly string[]): void {
  const scriptPath = resolve(SCRIPTS_DIR, `${script}${SCRIPT_EXTENSION}`);
  const child = spawn("node", [scriptPath, ...args], {
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code) => {
    process.exit(code ?? 1);
  });
  child.on("error", (err) => {
    process.stderr.write(`convex-auth: failed to spawn ${script}: ${err.message}\n`);
    process.exit(1);
  });
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h": {
      printHelp();
      return;
    }
    case "check": {
      runScript("check-consumer-contract", rest);
      return;
    }
    case "preflight": {
      runScript("preflight", rest);
      return;
    }
    case "migrate": {
      if (rest[0] !== "better-auth") {
        process.stderr.write("convex-auth: 'migrate' requires subcommand 'better-auth'\n\n");
        process.exit(2);
      }
      runScript("migrate-better-auth", rest.slice(1));
      return;
    }
    default: {
      process.stderr.write(`convex-auth: unknown command '${command}'\n\n`);
      printHelp();
      process.exit(2);
    }
  }
}

main();
