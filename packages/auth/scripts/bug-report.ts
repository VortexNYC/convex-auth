#!/usr/bin/env node
/**
 * `convex-auth bug-report` — gather a safe diagnostics bundle for GitHub issues.
 *
 * Collects package versions, Convex wiring, environment hints, and the
 * sanitized contents of the consumer's auth configuration. Secrets are
 * redacted before printing. The output is a markdown block that can be pasted
 * directly into the bug report template.
 */
import { createRequire } from "node:module";
import { readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);

function findPackageJsonWithVersion(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 10 && dir !== dirname(dir); i++) {
    const candidate = resolve(dir, "package.json");
    try {
      if (statSync(candidate).isFile()) {
        const pkg = JSON.parse(readFileSync(candidate, "utf-8")) as Record<string, unknown>;
        if (typeof pkg.version === "string") return candidate;
      }
    } catch {
      // keep walking
    }
    dir = dirname(dir);
  }
  return null;
}

type Args = {
  convexDir: string;
  open: boolean;
  output: string | null;
  repoRoot: string;
  title: string;
};

const SENSITIVE_KEY_PATTERN =
  /\b(clientSecret|secret|apiKey|apiSecret|token|password|privateKey|cookieToken|refreshToken|accessToken|webhookSecret|signingSecret)\s*:\s*(["'])([^\n]*?)\2/gi;

const PUBLIC_ENV_KEYS = new Set([
  "CONVEX_DEPLOYMENT",
  "CONVEX_URL",
  "VITE_CONVEX_URL",
  "NEXT_PUBLIC_CONVEX_URL",
  "EXPO_PUBLIC_CONVEX_URL",
  "NODE_ENV",
  "npm_package_version",
]);

function parseArgs(argv: readonly string[]): Args {
  let convexDir = "./convex";
  let open = false;
  let output: string | null = null;
  let repoRoot = ".";
  let title = "";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--convex-dir" || arg === "-d") {
      const next = argv[++i];
      if (!next) throw new Error("--convex-dir requires a value");
      convexDir = next;
    } else if (arg.startsWith("--convex-dir=")) {
      convexDir = arg.slice("--convex-dir=".length);
    } else if (arg === "--repo-root" || arg === "-r") {
      const next = argv[++i];
      if (!next) throw new Error("--repo-root requires a value");
      repoRoot = next;
    } else if (arg.startsWith("--repo-root=")) {
      repoRoot = arg.slice("--repo-root=".length);
    } else if (arg === "--output" || arg === "-o") {
      const next = argv[++i];
      if (!next) throw new Error("--output requires a value");
      output = next;
    } else if (arg.startsWith("--output=")) {
      output = arg.slice("--output=".length);
    } else if (arg === "--title" || arg === "-t") {
      const next = argv[++i];
      if (!next) throw new Error("--title requires a value");
      title = next;
    } else if (arg.startsWith("--title=")) {
      title = arg.slice("--title=".length);
    } else if (arg === "--open") {
      open = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return { convexDir, open, output, repoRoot, title };
}

function printHelp(): void {
  process.stdout.write(
    "convex-auth bug-report — collect a safe diagnostics bundle for GitHub issues\n\n" +
      "Usage:\n" +
      "  pnpm dlx @vortex-api/convex-auth bug-report [options]\n\n" +
      "Options:\n" +
      "  --convex-dir <path>  Path to the convex/ directory (default: ./convex)\n" +
      "  --repo-root <path>   Repo root (default: .)\n" +
      "  --output <path>      Write markdown to file instead of stdout\n" +
      "  --title <string>     Pre-fill the GitHub issue title\n" +
      "  --open               Print a GitHub issue creation URL\n" +
      "  --help               Print this help\n\n" +
      "The output is sanitized: secret-like values in auth files are replaced with\n" +
      "[REDACTED] and only public environment variables are shown.\n",
  );
}

function safeReadFile(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

function safeReadJson(path: string): Record<string, unknown> | null {
  const raw = safeReadFile(path);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function resolvePackageVersion(repoRoot: string, name: string): string | null {
  try {
    const entry = require.resolve(name, { paths: [resolve(repoRoot)] });
    const realEntry = realpathSync(entry);
    const pkgPath = findPackageJsonWithVersion(dirname(realEntry));
    return pkgPath ? (safeReadJson(pkgPath)?.version as string | null) : null;
  } catch {
    return null;
  }
}

function redactSecrets(content: string): string {
  return content.replace(SENSITIVE_KEY_PATTERN, "$1: $2[REDACTED]$2");
}

function getEnvSnapshot(): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue;
    if (PUBLIC_ENV_KEYS.has(key)) {
      snapshot[key] = value;
    } else if (key === "ALLOW_EMAIL_TOKEN_FALLBACK" || key === "RESEND_FROM_ADDRESS") {
      snapshot[key] = value;
    } else if (
      key.startsWith("CONVEX_") ||
      key.startsWith("VITE_") ||
      key.startsWith("NEXT_PUBLIC_") ||
      key.startsWith("EXPO_PUBLIC_")
    ) {
      snapshot[key] = "[PRESENT (value hidden)]";
    }
  }
  return snapshot;
}

function gatherDiagnostics(args: Args): {
  files: Record<string, { exists: boolean; content: string | null }>;
  checks: string[];
  env: Record<string, string>;
  versions: Record<string, string | null>;
} {
  const root = resolve(args.repoRoot);
  const convex = resolve(root, args.convexDir);
  const packageJson = safeReadJson(resolve(root, "package.json"));

  const files = {
    "convex/auth.ts": safeReadFile(resolve(convex, "auth.ts")),
    "convex/auth.config.ts": safeReadFile(resolve(convex, "auth.config.ts")),
    "convex/convex.config.ts": safeReadFile(resolve(convex, "convex.config.ts")),
    "convex/http.ts": safeReadFile(resolve(convex, "http.ts")),
  };

  const diagnostics: string[] = [];

  if (!files["convex/auth.ts"]) {
    diagnostics.push("MISSING: convex/auth.ts is not present.");
  } else if (!files["convex/auth.ts"].includes("convexAuth")) {
    diagnostics.push("WARNING: convex/auth.ts does not call `convexAuth`.");
  }

  if (!files["convex/auth.config.ts"]) {
    diagnostics.push("MISSING: convex/auth.config.ts is not present.");
  } else if (!files["convex/auth.config.ts"].includes("createConvexAuthProvider")) {
    diagnostics.push("WARNING: convex/auth.config.ts does not use `createConvexAuthProvider`.");
  }

  if (!files["convex/convex.config.ts"]) {
    diagnostics.push("MISSING: convex/convex.config.ts is not present.");
  } else if (!files["convex/convex.config.ts"].includes("convexAuth")) {
    diagnostics.push("WARNING: convex/convex.config.ts does not mount the `convexAuth` component.");
  }

  if (!files["convex/http.ts"]) {
    diagnostics.push("MISSING: convex/http.ts is not present.");
  } else if (!files["convex/http.ts"].includes("addHttpRoutes")) {
    diagnostics.push("WARNING: convex/http.ts does not call `auth.addHttpRoutes`.");
  }

  const deps = {
    ...((packageJson?.dependencies ?? {}) as Record<string, string>),
    ...((packageJson?.devDependencies ?? {}) as Record<string, string>),
  };
  if (!("@vortex-api/convex-auth" in deps)) {
    diagnostics.push("WARNING: @vortex-api/convex-auth is not in root package.json dependencies.");
  }

  const env = getEnvSnapshot();
  if (!("CONVEX_DEPLOYMENT" in env) && !("CONVEX_URL" in env) && !("VITE_CONVEX_URL" in env)) {
    diagnostics.push("WARNING: No Convex deployment URL found in environment.");
  }

  const versions: Record<string, string | null> = {
    "@vortex-api/convex-auth":
      resolvePackageVersion(root, "@vortex-api/convex-auth") ?? deps["@vortex-api/convex-auth"],
    convex: resolvePackageVersion(root, "convex") ?? deps.convex,
    react: resolvePackageVersion(root, "react") ?? deps.react,
    "react-dom": resolvePackageVersion(root, "react-dom") ?? deps["react-dom"],
    next: resolvePackageVersion(root, "next") ?? deps.next,
    node: process.version,
  };

  return {
    files: Object.fromEntries(
      Object.entries(files).map(([name, content]) => [
        name,
        { exists: content !== null, content: content ? redactSecrets(content) : null },
      ]),
    ),
    checks: diagnostics,
    env,
    versions,
  };
}

function generateReport(args: Args): string {
  const { files, checks, env, versions } = gatherDiagnostics(args);

  const lines: string[] = [
    "## Environment",
    "",
    "| Package | Version |",
    "| --- | --- |",
    ...Object.entries(versions).map(
      ([name, version]) => `| ${name} | ${version ?? "(not installed)"} |`,
    ),
    "",
    "## Public environment variables",
    "",
    Object.keys(env).length === 0
      ? "_No public Convex environment variables found._"
      : [
          "| Variable | Value |",
          "| --- | --- |",
          ...Object.entries(env).map(([k, v]) => `| ${k} | ${v} |`),
        ].join("\n"),
    "",
    "## Convex wiring",
    "",
  ];

  for (const [name, { exists, content }] of Object.entries(files)) {
    lines.push(`### ${name}`);
    if (!exists) {
      lines.push("_File not found._");
    } else if (content === null) {
      lines.push("_Could not read file._");
    } else {
      lines.push("```ts");
      lines.push(content);
      lines.push("```");
    }
    lines.push("");
  }

  lines.push("## Diagnostics checks");
  lines.push("");
  if (checks.length === 0) {
    lines.push("All standard checks passed.");
  } else {
    for (const check of checks) {
      lines.push(`- ${check}`);
    }
  }
  lines.push("");

  lines.push("## Description");
  lines.push("");
  lines.push("<!-- Replace this with the actual bug description. -->");
  lines.push("");
  lines.push("## Reproduction");
  lines.push("");
  lines.push("<!-- Steps to reproduce, or a link to a minimal reproduction repo. -->");
  lines.push("");

  return lines.join("\n");
}

function generateIssueUrl(title: string): string {
  const base = "https://github.com/VortexNYC/convex-auth/issues/new";
  const params = new URLSearchParams({ template: "bug.md" });
  if (title.trim()) {
    params.set("title", title.trim());
  }
  return `${base}?${params.toString()}`;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const report = generateReport(args);

  if (args.output) {
    writeFileSync(resolve(args.output), report, "utf-8");
    process.stdout.write(`Bug report written to ${resolve(args.output)}\n`);
  } else {
    process.stdout.write(report);
  }

  if (args.open) {
    process.stdout.write(`\nOpen a new issue: ${generateIssueUrl(args.title)}\n`);
    process.stdout.write("Paste the markdown above into the bug report body.\n");
  }
}

main();
