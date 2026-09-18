import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { defineConfig } from "vite-plus";

// "use client" / "use server" are module-level directives in source, but
// bundling drops them once a directive module lands in a shared chunk —
// Next.js then treats client components (or server actions) as plain server
// modules and the build fails. Scan the source tree once so each emitted
// chunk can re-declare the directive its modules carry.
const moduleDirectives = new Map<string, string>();
for (const file of fsSync.readdirSync("src", {
  recursive: true,
  encoding: "utf8",
})) {
  if (!/\.(ts|tsx)$/.test(file)) continue;
  const head = fsSync
    .readFileSync(path.join("src", file), "utf8")
    .slice(0, 128);
  const match = head.match(/^"(use client|use server)"/);
  if (match) {
    moduleDirectives.set(path.resolve("src", file), match[1]);
  }
}

export default defineConfig({
  test: {
    server: {
      deps: {
        // The package's dist imports `argon2_wasm_bg.wasm` directly; it must be
        // transformed by the wasm plugin below instead of externalized to Node.
        inline: ["argon2id-wasm"],
      },
    },
  },
  plugins: [
    {
      name: "wasm-as-bytes",
      enforce: "pre",
      async load(id) {
        const path = id.split("?")[0];
        if (!path || !path.endsWith(".wasm")) {
          return null;
        }
        const bytes = await fs.readFile(path);
        // Mirrors the Convex bundler's wasmPlugin exactly: default-export a
        // compiled WebAssembly.Module so wasm-bindgen init takes the same
        // code path under vitest as it does in production.
        return `export default new WebAssembly.Module(new Uint8Array(Buffer.from(${JSON.stringify(bytes.toString("base64"))}, "base64")));`;
      },
    },
  ],
  pack: [
    {
      name: "lib",
      entry: {
        index: "src/index.ts",
        convex: "src/convex.ts",
        "agent-auth-protocol-convex": "src/agent-auth-protocol-convex.ts",
        "agent-auth-protocol-http": "src/agent-auth-protocol-http.ts",
        preflight: "src/preflight.ts",
        testing: "src/testing.ts",
        component: "src/component.ts",
        "consumer-contract": "src/consumer-contract.ts",
        "agent-auth-protocol": "src/agent-auth-protocol.ts",
        "auth-md": "src/auth-md.ts",
        waitlist: "src/waitlist.tsx",
        react: "src/react.entry.ts",
        "react-native": "src/react-native.entry.ts",
        "react-native-passkeys": "src/react-native/usePasskeys.ts",
        nextjs: "src/nextjs/index.tsx",
        "nextjs-server": "src/nextjs/server/index.tsx",
        ui: "src/ui.entry.ts",
        mcp: "src/mcp.ts",
        "component/convex.config": "src/component/convex.config.ts",
        "component/_generated/component": "src/component/_generated/component.ts",
        "component/core/convex.config": "src/component/core/convex.config.ts",
        "component/core/_generated/component": "src/component/core/_generated/component.ts",
        "component/organizations/convex.config": "src/component/organizations/convex.config.ts",
        "component/organizations/_generated/component":
          "src/component/organizations/_generated/component.ts",
        "component/servicePrincipals/convex.config":
          "src/component/servicePrincipals/convex.config.ts",
        "component/servicePrincipals/_generated/component":
          "src/component/servicePrincipals/_generated/component.ts",
        "component/apiKeys/convex.config": "src/component/apiKeys/convex.config.ts",
        "component/apiKeys/_generated/component": "src/component/apiKeys/_generated/component.ts",
        "component/agentAuth/convex.config": "src/component/agentAuth/convex.config.ts",
        "component/agentAuth/_generated/component":
          "src/component/agentAuth/_generated/component.ts",
        "component/authMd/convex.config": "src/component/authMd/convex.config.ts",
        "component/authMd/_generated/component": "src/component/authMd/_generated/component.ts",
        "component/webhooks/convex.config": "src/component/webhooks/convex.config.ts",
        "component/webhooks/_generated/component": "src/component/webhooks/_generated/component.ts",
        "component/mcpOauth/convex.config": "src/component/mcpOauth/convex.config.ts",
        "component/mcpOauth/_generated/component": "src/component/mcpOauth/_generated/component.ts",
      },
      format: "esm",
      dts: true,
      clean: true,
      fixedExtension: false,
      hash: true,
      outDir: "dist",
      outputOptions: {
        advancedChunks: {
          groups: [
            // A chunk carries exactly one directive — "use server" modules
            // must never share a chunk with "use client" modules.
            { name: "server-actions", test: /server[\/\\]invalidateCache/ },
          ],
        },
        banner: (chunk) => {
          for (const id of chunk.moduleIds) {
            const directive = moduleDirectives.get(id.split("?")[0]);
            if (directive !== undefined) {
              return `"${directive}";`;
            }
          }
          return "";
        },
      },
      deps: {
        alwaysBundle: [/^convex-auth-(core|react|react-native|ui)$/],
        neverBundle: [
          "convex",
          "convex-helpers",
          "react",
          "react-dom",
          /^next(\/|$)/,
          "server-only",
          "path-to-regexp",
          /^react-native/,
          /^expo/,
          /^@base-ui/,
          /^@floating-ui/,
          "lucide-react",
          "class-variance-authority",
          "clsx",
          "tailwind-merge",
          "use-sync-external-store",
          "@convex-dev/rate-limiter",
          "@noble/hashes",
          "argon2id-wasm",
          "jose",
          "oauth4webapi",
          "otpauth",
          "cookie",
          "set-cookie-parser",
        ],
      },
    },
    {
      name: "scripts",
      entry: {
        cli: "scripts/cli.ts",
        "check-consumer-contract": "scripts/check-consumer-contract.ts",
        preflight: "scripts/preflight.ts",
        "bug-report": "scripts/bug-report.ts",
        "migrate-better-auth": "scripts/migrate-better-auth.ts",
      },
      format: "esm",
      dts: false,
      clean: true,
      fixedExtension: false,
      hash: false,
      outDir: "dist/scripts",
      target: "node18",
    },
  ],
});
