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
  title: "Convex Better Auth 2.0",
  description: "Full-stack auth for Convex and Better Auth.",
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
