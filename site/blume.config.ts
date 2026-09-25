import { defineConfig } from "blume";
import { openapi } from "blume/reference";
import { filesystem, githubReleases } from "blume/sources";

// Astro/blume prerender runs in Node. Some components (e.g. @pierre/diffs)
// read navigator.userAgent, which only exists in Node 21+. Provide a minimal
// polyfill so builds on Node 20 don't fail with a undefined navigator error.
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
    tabs: [{ label: "API Reference", path: "/api" }],
  },
  theme: {
    accent: {
      light: "#000000",
      dark: "#ffffff",
    },
  },
});
