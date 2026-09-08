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
  title: "convex-auth",
  description:
    "Native auth runtime for Convex, with a one-time migration path from the Better Auth Convex component.",
  content: {
    root: "../docs",
  },
  ai: {
    llmsTxt: true,
  },
  deployment: {
    site: "https://gregarious-perch-710.convex.site",
  },
});
