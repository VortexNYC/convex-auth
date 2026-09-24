#!/usr/bin/env node
// Guards the wire contract: every HTTP route registered in the native runtime
// must be documented in openapi/auth.yaml, and every spec path must exist in
// code. Runs on every PR — the spec is the published contract, so drift is a
// release-blocking defect, not a nit.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const specPath = join(root, "openapi/auth.yaml");
const routeFiles = [
  join(root, "packages/auth/src/convex-runtime/native/http.ts"),
  join(root, "packages/auth/src/convex-runtime/native/oauthHttp.ts"),
];

// --- spec paths: top-level keys under `paths:` (2-space indent) ---
const specText = readFileSync(specPath, "utf8");
const specPaths = new Set();
let inPaths = false;
for (const line of specText.split("\n")) {
  if (/^paths:\s*$/.test(line)) {
    inPaths = true;
    continue;
  }
  if (inPaths) {
    if (/^\S/.test(line)) break; // left the paths block
    const m = line.match(/^  (\/\S+):\s*$/);
    if (m) specPaths.add(m[1]);
  }
}

// --- code routes: `path:` exact + `pathPrefix:` converted to {param} form ---
const codePaths = new Set();
const aliasPaths = new Set(["/api/auth/sign-up", "/api/auth/sign-in", "/api/auth/get-session"]);
for (const file of routeFiles) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/path:\s*"([^"]+)"/g)) codePaths.add(m[1]);
  for (const m of src.matchAll(/pathPrefix:\s*"([^"]+)"/g)) {
    // "/api/auth/callback/" -> "/api/auth/callback/{provider}"
    codePaths.add(m[1].replace(/\/$/, "") + "/{param}");
  }
}

const specParamPaths = new Set([...specPaths].map((p) => p.replace(/\{[^}]+\}/g, "{param}")));
const missing = [];
for (const p of codePaths) {
  const norm = p.replace(/\{[^}]+\}/g, "{param}");
  if (specPaths.has(p) || specParamPaths.has(norm)) continue;
  missing.push(p);
}
const stale = [...specPaths].filter((p) => {
  const norm = p.replace(/\{[^}]+\}/g, "{param}");
  return ![...codePaths].some((c) => c.replace(/\{[^}]+\}/g, "{param}") === norm);
});

let failed = false;
for (const p of missing) {
  console.error(
    `::error::Route "${p}" exists in code but is missing from openapi/auth.yaml. The spec is the published contract — document it or remove the route.`,
  );
  failed = true;
}
for (const p of stale) {
  console.error(
    `::error::openapi/auth.yaml documents "${p}" but no code route produces it. Remove it or restore the route.`,
  );
  failed = true;
}
if (failed) process.exit(1);
console.log(
  `✓ openapi/auth.yaml covers all ${codePaths.size} code routes (${specPaths.size} spec paths)`,
);
void aliasPaths; // aliases share handlers with canonical paths; still spec'd
