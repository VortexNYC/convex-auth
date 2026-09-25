import { defineConfig } from "blume";
import { openapi } from "blume/reference";
import { filesystem, githubReleases } from "blume/sources";

// Astro/blume prerender runs in Node. Some components (e.g. @pierre/diffs)
// read navigator.userAgent, which only exists in Node 21+. Provide a minimal
// polyfill so builds on Node <21 don't fail with a undefined navigator error.
if (typeof globalThis.navigator === "undefined") {
  Object.defineProperty(globalThis, "navigator", {
    value: { userAgent: "Blume" },
    configurable: true,
    writable: true,
  });
}

export default defineConfig({
  title: "Convex Auth",
  description: "Vortex-native, full-stack authentication for Convex.",
  logo: "/logo.svg",
  github: {
    owner: "VortexNYC",
    repo: "convex-auth",
    dir: "docs",
  },
  content: {
    // The filesystem source's root doubles as the `blume version` snapshot
    // target — snapshots land in docs/<id>/ next to the live tree.
    sources: [
      filesystem({ root: "../docs" }),
      githubReleases({
        prefix: "changelog",
        owner: "VortexNYC",
        repo: "convex-auth",
      }),
    ],
  },
  deployment: {
    site: "https://resilient-mule-559.convex.site",
  },
  reference: [
    openapi({
      sources: [
        {
          spec: "../openapi/auth.yaml",
          route: "api",
          label: "HTTP API",
        },
      ],
    }),
  ],
  versions: {
    archived: [{ id: "v2", label: "v2.x" }],
    current: { label: "v3" },
  },
  navigation: {
    tabs: [
      { label: "API Reference", path: "/api" },
      { label: "Changelog", path: "/changelog" },
    ],
    actions: [
      {
        label: "npm",
        href: "https://www.npmjs.com/package/@vortex-api/convex-auth",
      },
    ],
    featured: [
      {
        label: "GitHub",
        href: "https://github.com/VortexNYC/convex-auth",
        icon: "github",
      },
      {
        label: "npm · @vortex-api/convex-auth",
        href: "https://www.npmjs.com/package/@vortex-api/convex-auth",
        icon: "package",
      },
    ],
  },
  agents: {
    llmsTxt: {
      details:
        "Convex Auth is a Convex-native authentication library (sessions, OAuth, passkeys, organizations, API keys, webhooks, MCP OAuth) published as @vortex-api/convex-auth. Use these docs when integrating it into a Convex app; the v2 archive documents the previous major for migrations.",
    },
  },
  theme: {
    accent: {
      light: "#000000",
      dark: "#ffffff",
    },
  },
});
