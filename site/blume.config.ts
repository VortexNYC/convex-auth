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
    site: "https://labs.vortex.nyc",
    base: "/convex-auth",
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
      {
        label: "Component",
        href: "https://www.convex.dev/components/convex-better-auth-2",
      },
    ],
  },
  redirects: [
    { from: "/examples", to: "/" },
    { from: "/client", to: "/react" },
    {
      from: "/migrating-from-full-component",
      to: "/migrating-to-feature-gated-components",
    },
    { from: "/components/sign-in", to: "/components/react/sign-in" },
    { from: "/components/organization", to: "/components/react/organization" },
    { from: "/components/account", to: "/components/react/account" },
    { from: "/components/api-keys", to: "/components/react/api-keys" },
    { from: "/components/webhooks", to: "/components/react/webhooks" },
    { from: "/components/security", to: "/components/react/security" },
    { from: "/components/admin", to: "/components/react/admin" },
    { from: "/components/providers", to: "/components/react/providers" },
    // React Native was a single page; it now has per-section subpages.
    { from: "/components/react-native", to: "/components/react-native/sign-in" },
    // The v2 archive was removed; land its deep links on the closest v3 page.
    { from: "/v2", to: "/" },
    { from: "/v2/index", to: "/" },
    { from: "/v2/client", to: "/react" },
    { from: "/v2/ui-components", to: "/components" },
    { from: "/v2/examples", to: "/react" },
    {
      from: "/v2/migrating-from-full-component",
      to: "/migrating-to-feature-gated-components",
    },
    {
      from: "/v2/migrating-from-better-auth",
      to: "/migrating-from-better-auth",
    },
  ],
  seo: {
    organization: {
      name: "Vortex",
      logo: "/logo.svg",
      sameAs: [
        "https://github.com/VortexNYC",
        "https://www.npmjs.com/package/@vortex-api/convex-auth",
        "https://www.convex.dev/components/convex-better-auth-2",
      ],
    },
    software: {
      license: "Apache-2.0",
      price: 0,
      operatingSystem: "Node.js 22+",
    },
  },
  agents: {
    llmsTxt: {
      details:
        "Convex Auth is a Convex-native authentication library (sessions, OAuth, passkeys, organizations, API keys, webhooks, MCP OAuth) published as @vortex-api/convex-auth. Use these docs when integrating it into a Convex app.",
    },
  },
  theme: {
    accent: {
      light: "oklch(0.21 0.008 250)",
      dark: "oklch(0.97 0.004 250)",
    },
    fonts: {
      // Inter Tight shares Inter's metrics but bakes in display tracking —
      // headings get real optical contrast over the Inter body without a
      // family clash. Geist Mono is narrower than IBM Plex Mono, so inline
      // code and wide tables carry more characters per line.
      body: "inter",
      display: "inter-tight",
      mono: "geist-mono",
    },
  },
  // Injected into every example preview frame after Blume's defaults — scans
  // `packages/auth/src` so component classes compile and declares the
  // semantic design tokens the components reference.
  examples: { css: "examples/theme.css" },
});
