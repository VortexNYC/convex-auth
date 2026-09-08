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
  navigation: {
    sidebar: [
      "index",
      "concepts",
      "installation",
      "quickstart",
      {
        label: "Authentication",
        items: [
          "client",
          "react-native",
          "email-password",
          "oauth",
          "two-factor",
          "magic-links",
          "email-otp",
        ],
      },
      {
        label: "B2B & advanced",
        items: [
          "organizations",
          "api-keys",
          "webhooks",
          "identity",
          "mcp",
          "agent-auth",
          "audit",
          "authorization",
          "consumer-contract",
        ],
      },
      {
        label: "Tooling",
        items: ["testing", "preflight", "examples", "compatibility"],
      },
      {
        label: "Reference",
        items: [
          "configuration",
          "server-api",
          "security",
          "production",
          "better-auth-alternatives",
          "better-auth-to-convex",
        ],
      },
      {
        label: "Architecture",
        items: [
          "motivation",
          "how-we-got-here",
          "convex-native-auth-strategy",
          "feature-gated-components",
        ],
      },
      {
        label: "Migration",
        items: [
          "migrating-from-better-auth",
          "migrating-from-convex-dev-better-auth",
          "migrating-from-full-component",
        ],
      },
      {
        label: "Decisions",
        items: [
          "decisions/ADR-001-convex-auth-2.0-alignment",
          "decisions/ADR-002-one-time-better-auth-migration",
        ],
      },
    ],
  },
  deployment: {
    site: "https://gregarious-perch-710.convex.site",
  },
});
