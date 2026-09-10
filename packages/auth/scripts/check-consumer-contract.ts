#!/usr/bin/env node
/**
 * CI runner for the convex-auth consumer contract.
 *
 * Usage:
 *   node packages/convex-auth/scripts/check-consumer-contract.ts [--convex-dir <path>]
 *
 * Defaults `--convex-dir` to `./convex` (relative to CWD).
 * Exits 0 on success, 1 if any contract violations are found.
 *
 * See `docs/architecture/consumer-contract.md` for the full contract.
 */

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

// Use the package's public subpath export so the script works both from the
// dev tree (workspace) and when shipped (resolves to dist/consumer-contract.js).
import {
  checkConsumerContract,
  type ConsumerContractViolation,
} from "@vortex-api/convex-auth/consumer-contract";

function parseArgs(argv: readonly string[]): {
  convexDir: string;
  legitAnchorTables?: string[];
} {
  let convexDir = "./convex";
  let legitAnchorTables: string[] | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--convex-dir" || arg === "-d") {
      const next = argv[i + 1];
      if (!next) {
        console.error("--convex-dir requires a value");
        process.exit(2);
      }
      convexDir = next;
      i++;
    } else if (arg?.startsWith("--convex-dir=")) {
      convexDir = arg.slice("--convex-dir=".length);
    } else if (arg === "--legit-anchor-tables") {
      const next = argv[i + 1];
      if (!next) {
        console.error("--legit-anchor-tables requires a value (comma-separated)");
        process.exit(2);
      }
      legitAnchorTables = next
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      i++;
    } else if (arg?.startsWith("--legit-anchor-tables=")) {
      legitAnchorTables = arg
        .slice("--legit-anchor-tables=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg === "-h" || arg === "--help") {
      console.log(
        "Usage: check-consumer-contract [--convex-dir <path>] [--legit-anchor-tables <a,b,c>]\n" +
          "\n" +
          "Checks a Convex consumer for re-introductions of the org/member mirror.\n" +
          "\n" +
          "Options:\n" +
          "  --convex-dir <path>           Path to the consumer's convex/ directory (default: ./convex).\n" +
          "  --legit-anchor-tables <list>  Comma-separated table names allowed to carry convexAuth*Id\n" +
          "                                bridge columns (default: organizations,users). Override sparingly\n" +
          "                                and only for deliberate per-member override tables.\n" +
          "\n" +
          "See docs/architecture/consumer-contract.md",
      );
      process.exit(0);
    }
  }
  return legitAnchorTables === undefined ? { convexDir } : { convexDir, legitAnchorTables };
}

function groupByRule(
  violations: readonly ConsumerContractViolation[],
): Map<string, ConsumerContractViolation[]> {
  const out = new Map<string, ConsumerContractViolation[]>();
  for (const v of violations) {
    const list = out.get(v.rule) ?? [];
    list.push(v);
    out.set(v.rule, list);
  }
  return out;
}

function main(): void {
  const { convexDir, legitAnchorTables } = parseArgs(process.argv.slice(2));
  const absDir = resolve(process.cwd(), convexDir);

  if (!existsSync(absDir) || !statSync(absDir).isDirectory()) {
    console.error(`convex dir not found: ${absDir}`);
    process.exit(2);
  }

  const { ok, violations } = checkConsumerContract(
    legitAnchorTables === undefined
      ? { convexDir: absDir }
      : { convexDir: absDir, legitAnchorTables },
  );

  // Codex audit (2026-05-28) hardening: surface bypass risks explicitly
  // even when the checker reports OK. A clean exit is necessary but not
  // sufficient — the user must know what the checker did NOT inspect.
  const whitelistSize = legitAnchorTables?.length ?? 0;
  const warnings: string[] = [];
  if (whitelistSize > 3) {
    warnings.push(
      `--legit-anchor-tables whitelist has ${whitelistSize} entries. ` +
        "Legitimate anchors are usually 1-2 tables (organizations + maybe users). " +
        "A long whitelist suggests anti-patterns are being masked. " +
        "Audit each entry against docs/migration/truth-migration-playbook.md.",
    );
  }

  if (ok) {
    console.log(`convex-auth consumer contract: OK (${absDir})`);
    console.log("");
    console.log("Scope: .ts files only under convex/.");
    console.log(
      "Does NOT detect: re-exports through type aliases, .js/.json/.cjs " +
        "shims, generated code (_generated/), or dynamic schema construction. " +
        "If your consumer uses any of those, supplement with code review.",
    );
    if (warnings.length > 0) {
      console.log("");
      for (const warning of warnings) {
        console.log(`WARNING: ${warning}`);
      }
    }
    process.exit(0);
  }

  console.error(`convex-auth consumer contract: ${violations.length} violation(s) in ${absDir}\n`);
  const grouped = groupByRule(violations);
  for (const [rule, list] of grouped) {
    console.error(`[${rule}] ${list.length} violation(s)`);
    for (const v of list) {
      const loc = v.line !== undefined ? `${v.file}:${v.line}` : v.file;
      console.error(`  ${loc}`);
      console.error(`    ${v.message}`);
    }
    console.error("");
  }
  console.error("See docs/architecture/consumer-contract.md for remediation guidance.");
  process.exit(1);
}

main();
