#!/usr/bin/env node
// Guards the runtime boundary: the component and every consumer-facing
// convex/ directory execute in Convex's V8 isolate, not Node.js — no
// `node:` builtins, no Buffer, no atob/btoa, no react-dom/server, and no
// "use node" escapes. These rules lived only in AGENTS.md; this script
// makes them a release-blocking check so a Node-only API can't slip into
// deployed source and surface as a consumer-side isolate crash.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Deployed source surface — same paths `pnpm run lint:convex` targets.
const scanRoots = [];
for (const pkg of readdirSync(join(root, "packages"))) {
  for (const sub of ["src/convex-runtime", "src/component"]) {
    const dir = join(root, "packages", pkg, sub);
    if (existsSync(dir)) scanRoots.push(dir);
  }
}
for (const ex of readdirSync(join(root, "examples"))) {
  const dir = join(root, "examples", ex, "convex");
  if (existsSync(dir)) scanRoots.push(dir);
}

const rules = [
  {
    name: `"use node" directive — deployed files run in the Convex isolate`,
    re: /["']use node["']/,
  },
  {
    name: `node: import — no Node builtins in the isolate`,
    re: /(?:from|import|require)\s*\(?\s*["']node:/,
  },
  {
    name: `react-dom/server — server-only React is unavailable in the isolate`,
    re: /["']react-dom\/server["']/,
  },
  {
    name: `atob/btoa — use bytesToBase64url/base64urlToBytes helpers instead`,
    re: /\b(?:atob|btoa)\s*\(/,
  },
  {
    name: `Buffer — no Node Buffer in the isolate; use Uint8Array/TextEncoder`,
    re: /\bBuffer\b/,
  },
];

const skipFile = /\.(test|vitest|spec)\.[cm]?[tj]sx?$/;
const isSource = /\.[cm]?[tj]sx?$/;

function* walk(dir) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      // _generated/ is Convex codegen output — not hand-written source.
      if (ent.name === "_generated" || ent.name === "node_modules") continue;
      yield* walk(p);
    } else if (isSource.test(ent.name) && !skipFile.test(ent.name)) {
      yield p;
    }
  }
}

let failed = false;
let scanned = 0;
for (const dir of scanRoots) {
  for (const file of walk(dir)) {
    scanned++;
    const rel = relative(root, file);
    const lines = readFileSync(file, "utf8").split("\n");
    for (const [i, line] of lines.entries()) {
      for (const rule of rules) {
        if (rule.re.test(line)) {
          console.error(`::error file=${rel},line=${i + 1}::${rule.name}`);
          failed = true;
        }
      }
    }
  }
}
if (failed) {
  console.error("Deployed source must be isolate-portable (see AGENTS.md § Runtime portability).");
  process.exit(1);
}
console.log(`✓ runtime guard: ${scanned} deployed files clean across ${scanRoots.length} roots`);
