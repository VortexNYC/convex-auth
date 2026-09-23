import { defineConfig } from "blume";

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
    sources: [
      { type: "filesystem", root: "../docs" },
      {
        type: "github-releases",
        prefix: "changelog",
        owner: "VortexNYC",
        repo: "convex-auth",
      },
    ],
  },
  deployment: {
    site: "https://your-deployment.convex.site",
  },
  openapi: {
    enabled: true,
    sources: [
      {
        spec: "../openapi/auth.yaml",
        route: "api",
        label: "HTTP API",
      },
    ],
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
