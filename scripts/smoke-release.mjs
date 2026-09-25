#!/usr/bin/env node
/**
 * smoke:release — pre-release proof that the packed package works on real deployments.
 *
 * For each example:
 *   1. Build @vortex-api/convex-auth (same as prepublishOnly), then npm pack
 *   2. Copy the example to a scratch dir, rewrite the dep to file:<tarball>, npm install
 *   3. Push to the example's OWN configured deployment (convex dev --once)
 *   4. Functional smoke: sign-up + sign-in over HTTP against CONVEX_SITE_URL
 *
 * Safety:
 *   - Refuses `prod:*` deployment targets unless --allow-prod is passed.
 *   - For cloud deployments the SITE_URL host must match the deployment name,
 *     so a misconfigured env can't green-light a stale deployment.
 *   - `anonymous:*` deployments are local backends bound to the example's own
 *     directory — pushing from the scratch copy would spawn a fresh backend with
 *     no env vars (and fail env validation by design). For anonymous targets the
 *     script proves the tarball installs, typechecks the example's convex/
 *     against the installed package, and runs the functional smoke against
 *     the live backend a `convex dev` watcher keeps synced to source. The
 *     full pack->push->flow proof comes from the cloud dev deployments.
 *
 * Usage:
 *   node scripts/smoke-release.mjs                 # all examples
 *   node scripts/smoke-release.mjs --example react --example server
 *   node scripts/smoke-release.mjs --example=react
 *   node scripts/smoke-release.mjs --skip-functional   # install + push only
 *   node scripts/smoke-release.mjs --keep              # keep scratch dir
 *   node scripts/smoke-release.mjs --allow-prod        # permit prod:* targets
 */
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EXAMPLES_DIR = join(ROOT, "examples");
const PKG_DIR = join(ROOT, "packages", "auth");

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);

function optValues(n) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === `--${n}`) {
      const v = args[i + 1];
      if (v === undefined || v.startsWith("--")) {
        console.error(`--${n} requires a value`);
        process.exit(2);
      }
      out.push(v);
      i++;
    } else if (args[i].startsWith(`--${n}=`)) {
      out.push(args[i].slice(n.length + 3));
    }
  }
  return out;
}

const ONLY = optValues("example");
const SKIP_FUNCTIONAL = flag("skip-functional");
const ALLOW_PROD = flag("allow-prod");
const KEEP = flag("keep");

const EXCLUDED = new Set([
  "node_modules",
  ".convex",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".expo",
  "coverage",
]);

const SITE_URL_KEYS = [
  "CONVEX_SITE_URL",
  "VITE_CONVEX_SITE_URL",
  "EXPO_PUBLIC_CONVEX_SITE_URL",
  "NEXT_PUBLIC_CONVEX_SITE_URL",
];

function run(cmd, argv, opts = {}) {
  return execFileSync(cmd, argv, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 600_000,
    ...opts,
  });
}

function readEnvLocal(dir) {
  const env = {};
  for (const name of [".env.local", ".env"]) {
    const p = join(dir, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*(?:#.*)?$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

function findSiteUrl(env) {
  for (const k of SITE_URL_KEYS) if (env[k]) return env[k];
  return null;
}

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

function copyExample(name, dest) {
  cpSync(join(EXAMPLES_DIR, name), dest, {
    recursive: true,
    filter: (src) => !EXCLUDED.has(src.split("/").pop()),
  });
}

function retargetToTarball(dir, tgz) {
  const pkgPath = join(dir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  for (const section of ["dependencies", "devDependencies"]) {
    if (pkg[section]?.["@vortex-api/convex-auth"]) {
      pkg[section]["@vortex-api/convex-auth"] = `file:${tgz}`;
    }
  }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

async function smokeExample(name, tgz, scratch) {
  const result = { name, install: false, push: "skipped", signup: "-", signin: "-", notes: [] };
  const dir = join(scratch, name);
  copyExample(name, dir);

  const env = readEnvLocal(dir);
  const deployment = env.CONVEX_DEPLOYMENT;
  const siteUrl = findSiteUrl(env);
  if (!deployment) {
    result.notes.push("no CONVEX_DEPLOYMENT — skipping");
    return result;
  }
  result.deployment = deployment.split(" ")[0]; // strip trailing comment

  if (result.deployment.startsWith("prod:") && !ALLOW_PROD) {
    result.push = "REFUSED";
    result.notes.push("prod deployment — pass --allow-prod to override");
    return result;
  }

  retargetToTarball(dir, tgz);
  run("npm", ["install", "--no-audit", "--no-fund"], { cwd: dir });
  result.install = true;

  const isAnonymous = result.deployment.startsWith("anonymous:");
  if (isAnonymous) {
    if (SKIP_FUNCTIONAL) {
      result.push = "watcher-owned";
      result.notes.push("functional skipped — install-only proof for anonymous target");
      return result;
    }
    if (!siteUrl) {
      result.push = "no-live-backend";
      result.notes.push("no SITE_URL var — functional skipped");
      return result;
    }
    // The scratch copy never reaches the watcher backend, so prove the
    // tarball another way: typecheck the example's convex/ dir against the
    // installed package — broken `exports`/`.d.ts`/`files` entries fail here.
    const convexTsconfig = join(dir, "convex", "tsconfig.json");
    if (existsSync(convexTsconfig)) {
      try {
        run("npx", ["tsc", "--noEmit", "-p", "convex/tsconfig.json"], { cwd: dir });
      } catch (e) {
        const out = String(e.stdout ?? "") + String(e.stderr ?? "");
        result.push = "FAILED";
        result.notes.push(
          "tarball typecheck failed | " + out.split("\n").filter(Boolean).slice(-3).join(" | "),
        );
        return result;
      }
    }
    // Local backends are path-bound: pushing the scratch copy would spawn a
    // fresh backend with no env vars. The watcher-owned backend already serves
    // this deployment — verify it's reachable, then run the functional smoke.
    try {
      await fetch(`${siteUrl}/`, { signal: AbortSignal.timeout(5_000) });
      result.push = "watcher-owned";
    } catch {
      result.push = "no-live-backend";
      result.notes.push("start `npx convex dev` in the example first");
      return result;
    }
  } else {
    // Cloud dev deployment: the site URL must match the deployment we push to,
    // otherwise the functional check could hit a stale/other deployment.
    const deployName = result.deployment.replace(/^dev:/, "");
    if (!siteUrl) {
      result.push = "FAILED";
      result.notes.push("no SITE_URL var — cannot verify the pushed deployment");
      return result;
    }
    if (!siteUrl.includes(deployName)) {
      result.push = "FAILED";
      result.notes.push(`site URL host does not match deployment ${deployName}`);
      return result;
    }
    try {
      run("npx", ["convex", "dev", "--once"], { cwd: dir });
      result.push = "ok";
    } catch (e) {
      const out = String(e.stderr ?? "") + String(e.stdout ?? "");
      result.push = "FAILED";
      result.notes.push(out.split("\n").filter(Boolean).slice(-3).join(" | "));
      return result;
    }
  }

  if (SKIP_FUNCTIONAL) return result;
  if (!siteUrl) {
    result.signup = "skipped";
    result.notes.push("no SITE_URL var — functional skipped");
    return result;
  }

  const email = `smoke-${Date.now()}-${name}@smoke.invalid`;
  const password = `Sm0ke.${randomBytes(6).toString("base64url")}!Rls`;
  const up = await post(`${siteUrl}/api/auth/sign-up/email`, {
    name: "Release Smoke",
    email,
    password,
  });
  result.signup =
    up.status === 200 && up.json?.token && up.json?.refreshToken
      ? "ok"
      : `HTTP ${up.status} ${JSON.stringify(up.json).slice(0, 120)}`;
  if (result.signup !== "ok") return result;

  const inRes = await post(`${siteUrl}/api/auth/sign-in/email`, { email, password });
  result.signin =
    inRes.status === 200 && inRes.json?.token
      ? "ok"
      : `HTTP ${inRes.status} ${JSON.stringify(inRes.json).slice(0, 120)}`;
  return result;
}

const available = readdirSync(EXAMPLES_DIR).filter((d) => {
  const p = join(EXAMPLES_DIR, d);
  return existsSync(join(p, "package.json")) && existsSync(join(p, "convex"));
});

if (ONLY.length) {
  const bad = ONLY.filter((n) => !available.includes(n));
  if (bad.length) {
    console.error(`Unknown example(s): ${bad.join(", ")}. Available: ${available.join(", ")}`);
    process.exit(2);
  }
}
const examples = (ONLY.length ? ONLY : available).sort();

const scratch = mkdtempSync(join(tmpdir(), "ca-smoke-"));
const results = [];
let failures = [];

try {
  // Match the publish lifecycle: prepublishOnly builds before the tarball is made.
  console.log(`Building @vortex-api/convex-auth…`);
  run("pnpm", ["--filter", "@vortex-api/convex-auth", "run", "build"], { cwd: ROOT });
  console.log(`Packing…`);
  const packOut = run("npm", ["pack", "--pack-destination", scratch], { cwd: PKG_DIR });
  const tgz = join(scratch, packOut.trim().split("\n").at(-1).trim());
  console.log(`Tarball: ${tgz}\nScratch: ${scratch}\n`);

  for (const ex of examples) {
    process.stdout.write(`▸ ${ex} … `);
    try {
      const r = await smokeExample(ex, tgz, scratch);
      results.push(r);
      console.log(
        `install=${r.install ? "✓" : "✗"} push=${r.push} signup=${r.signup} signin=${r.signin}` +
          (r.notes.length ? `  (${r.notes.join("; ")})` : ""),
      );
    } catch (e) {
      results.push({
        name: ex,
        install: false,
        push: "FAILED",
        signup: "-",
        signin: "-",
        notes: [String(e).slice(0, 200)],
      });
      console.log(`FAILED: ${String(e).split("\n")[0].slice(0, 160)}`);
    }
  }

  failures = results.filter((r) => {
    if (!r.install) return true;
    if (r.push !== "ok" && r.push !== "watcher-owned") return true;
    if (!SKIP_FUNCTIONAL && (r.signup !== "ok" || r.signin !== "ok")) return true;
    return false;
  });

  if (results.length === 0) {
    console.error("\nNo examples ran — refusing to pass an empty gate.");
    failures = [{ name: "(none)" }];
  }

  console.log(`\n${results.length - failures.length}/${results.length} examples passed.`);
} finally {
  if (!KEEP && failures.length === 0) rmSync(scratch, { recursive: true, force: true });
  else console.log(`Scratch kept: ${scratch}`);
}
process.exit(failures.length ? 1 : 0);
