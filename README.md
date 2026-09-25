<div align="center">

<img src="assets/logo.svg" width="64" height="64" alt="Convex Auth logo" />

# @vortex-api/convex-auth

**Auth that lives in your Convex database.** Sessions, users, organizations, API keys, webhooks, and MCP OAuth — implemented natively inside the Convex isolate, not adapted from a Node server.

Built by **[Vortex](https://vortex.nyc)** — Shlomo Kabareti.

> **Disclaimer:** This is an independent, community-driven project. It is not affiliated with or endorsed by Convex Inc.

[![CI][ci-badge]][ci]
[![npm][npm-badge]][npm]
[![Docs][docs-badge]][docs]
[![License][license-badge]][license]
[![Status][status-badge]][status]
[![Node][node-badge]][node]
[![pnpm][pnpm-badge]][pnpm]

**[npm](https://www.npmjs.com/package/@vortex-api/convex-auth)** · **[Docs](https://your-deployment.convex.site)** · **[Quickstart](#quickstart)** · **[Framework guides](#framework-guides)** · **[Architecture](<docs/(reference)/architecture.md>)**

</div>

---

## Why a native runtime

Auth libraries are built for long-lived Node.js or edge processes. Convex functions are none of that — stateless V8 isolates with a 32 MiB source limit, a 64 MB heap, deterministic queries, and no Node APIs. Bolting a general-purpose auth server onto that shape means fighting the runtime at every layer: plugin-owned request lifecycles, ORM assumptions, and bundle pressure that can't be patched away.

`convex-auth` takes the other path — **auth as Convex tables and functions**. Users, sessions, and identities are rows in your database; sign-in, verification, and token refresh are actions; the whole thing runs in the default isolate on Web Crypto. Auth ends up behaving like the rest of your Convex app: typed, transactional, realtime, and deployed with `convex dev`.

This design was validated by the community `@convex-dev/better-auth` adapter and by the auth-as-tables architecture Convex Auth 2.0 announced — this repo carries it to a complete platform. The full story is in [How we got here](<docs/(get-started)/how-we-got-here.md>).

## Features

**Every sign-in method** — email/password with verification and reset, Google/GitHub/Discord OAuth, magic links, email OTP, WebAuthn passkeys, TOTP two-factor with backup codes and trusted devices, anonymous sessions that link to real accounts.

**The platform layer** — organizations with roles and invitations, API keys, service principals, signed webhooks, MCP OAuth, session listing and revocation (including family-aware rotation).

**Real SSR, real clients** — HttpOnly cookie sessions through framework adapters for Next.js, TanStack Start, and Hono; React hooks and a drop-in client for SPAs; a secure-storage Expo/React Native client.

**Built to operate** — `check` and `preflight` CLIs that validate consumer wiring, a conformance suite, a typed consumer contract, and a one-time migration bridge from Better Auth.

## Framework guides

| Framework                                                                                                                                                      | Entry point                                  | Guide                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| <img src="https://raw.githubusercontent.com/VortexNYC/convex-auth/main/site/public/frameworks/react.svg" width="18" valign="middle" /> React (Vite SPA)        | `@vortex-api/convex-auth/react`              | [`client.mdx`](<docs/(framework-guides)/client.mdx>)                 |
| <img src="https://raw.githubusercontent.com/VortexNYC/convex-auth/main/site/public/frameworks/expo.svg" width="18" valign="middle" /> React Native / Expo      | `@vortex-api/convex-auth/react-native`       | [`react-native.mdx`](<docs/(framework-guides)/react-native.mdx>)     |
| <img src="https://raw.githubusercontent.com/VortexNYC/convex-auth/main/site/public/frameworks/nextjs.svg" width="18" valign="middle" /> Next.js (SSR)          | `@vortex-api/convex-auth/nextjs` + `/server` | [`nextjs.mdx`](<docs/(framework-guides)/nextjs.mdx>)                 |
| <img src="https://raw.githubusercontent.com/VortexNYC/convex-auth/main/site/public/frameworks/tanstack.svg" width="18" valign="middle" /> TanStack Start (SSR) | `@vortex-api/convex-auth/tanstack-start`     | [`tanstack-start.mdx`](<docs/(framework-guides)/tanstack-start.mdx>) |
| <img src="https://raw.githubusercontent.com/VortexNYC/convex-auth/main/site/public/frameworks/hono.svg" width="18" valign="middle" /> Hono (SSR)               | `@vortex-api/convex-auth/hono`               | [`hono.mdx`](<docs/(framework-guides)/hono.mdx>)                     |

Every SSR adapter implements the same contract: same-origin HttpOnly cookie sessions, an intent-based `/api/auth` proxy, OAuth/magic-link landing, near-expiry rotation, and revocation-aware session helpers — see the [SSR auth contract](<docs/(reference)/ssr-contract.md>).

## Quickstart

### 1. Install

```bash
pnpm add @vortex-api/convex-auth convex
```

### 2. Signing keys

Generate an RS256 keypair and set it on your Convex deployment:

```bash
node --input-type=module -e '
import { randomUUID } from "node:crypto";
import { generateKeyPair, exportJWK } from "jose";
const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
const pub = await exportJWK(publicKey);
const priv = await exportJWK(privateKey);
const kid = randomUUID();
pub.kid = kid;
priv.kid = kid;
console.log("JWT_PRIVATE_KEY=" + JSON.stringify(priv));
console.log("JWKS=" + JSON.stringify({ keys: [pub] }));
'
```

```bash
convex env set JWT_PRIVATE_KEY '<private-key-json>'
convex env set JWKS '<jwks-json>'
```

For email and OAuth, also set `CONVEX_SITE_URL`, `EMAIL_FROM_ADDRESS`, and your OAuth provider credentials (`GITHUB_CLIENT_ID`/`SECRET`, `GOOGLE_CLIENT_ID`/`SECRET`, `DISCORD_CLIENT_ID`/`SECRET`).

### 3. Register the auth provider

```ts
// convex/auth.config.ts
import { createConvexAuthProvider } from "@vortex-api/convex-auth/convex";

export default {
  providers: [createConvexAuthProvider()],
};
```

### 4. Mount the component

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import { v } from "convex/values";
import auth from "@vortex-api/convex-auth/convex.config";

const app = defineApp({
  env: {
    JWT_PRIVATE_KEY: v.string(),
    JWKS: v.string(),
  },
});

app.use(auth, {
  env: {
    JWT_PRIVATE_KEY: app.env.JWT_PRIVATE_KEY,
    JWKS: app.env.JWKS,
  },
});

export default app;
```

### 5. Configure auth

```ts
// convex/auth.ts
import { components } from "./_generated/api";
import { convexAuth, type EmailDraft } from "@vortex-api/convex-auth/convex";

const siteUrl = process.env.CONVEX_SITE_URL?.replace(/\/$/, "");

export const auth = convexAuth({
  component: components.convexAuth,
  emailAndPassword: {
    enabled: true,
    email: {
      from: process.env.EMAIL_FROM_ADDRESS ?? "auth@example.com",
      appOrigin: siteUrl,
      sendEmail: async (draft: EmailDraft) => {
        // Resend/Postmark/SES in production.
        throw new Error("Email provider not configured");
      },
      sendOnSignUp: true,
      sendOnSignIn: false,
    },
  },
  oauth: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
    },
  },
});

export const {
  signUp,
  signIn,
  signOut,
  updateSession,
  sendEmailVerification,
  verifyEmail,
  sendPasswordReset,
  resetPassword,
  verifyPassword,
  twoFactorEnable,
  twoFactorVerifyTOTP,
  twoFactorVerifyBackupCode,
  twoFactorDisable,
  twoFactorGenerateBackupCodes,
} = auth;
```

### 6. Wire HTTP routes

```ts
// convex/http.ts
import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);

export default http;
```

### 7. Wrap the app

```tsx
// src/main.tsx
import { ConvexReactClient, ConvexProvider } from "convex/react";
import { ConvexAuthClientProvider } from "@vortex-api/convex-auth/react";
import { api } from "../convex/_generated/api";
import App from "./App";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

function Root() {
  return (
    <ConvexProvider client={convex}>
      <ConvexAuthClientProvider actions={api.auth}>
        <App />
      </ConvexAuthClientProvider>
    </ConvexProvider>
  );
}
```

### 8. Sign in

```tsx
// src/SignIn.tsx
import { useAuthActions } from "@vortex-api/convex-auth/react";

export function SignIn() {
  const { signIn, isLoading, isAuthenticated } = useAuthActions();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await signIn({
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    });
  }

  if (isAuthenticated) {
    return <p>Already signed in.</p>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="email" type="email" required />
      <input name="password" type="password" required />
      <button type="submit" disabled={isLoading}>
        {isLoading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
```

### 9. Validate

```bash
pnpm dlx @vortex-api/convex-auth check     # consumer contract (static)
pnpm dlx @vortex-api/convex-auth preflight # live install + deployment checks
```

`check` validates that your `convex/` files don't import internal exports; `preflight` verifies env vars and the component mount. See [`examples/`](examples/) for runnable consumers.

## Migrating from Better Auth

Already on Better Auth? Mount the legacy `betterAuth` adapter component alongside `convexAuth`, run `pnpm dlx @vortex-api/convex-auth migrate better-auth` to copy users, sessions, and identities into the native tables once, then cut over and uninstall the bridge packages. Migrated session rows are inert — old JWTs don't carry over, so users sign in once more after the switch. The full runbook is in [`docs/(migrations)/migrating-from-better-auth.md`](<docs/(migrations)/migrating-from-better-auth.md>).

## Compatibility

See [`docs/(get-started)/installation.mdx`](<docs/(get-started)/installation.mdx>) for supported versions of Convex, React, React Native / Expo, Node, and pnpm.

## Packages

| Package                   | Path            | Description                                                                                                                  |
| ------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `@vortex-api/convex-auth` | `packages/auth` | The only public package. Convex-native auth component, control plane, native server integration, React/React Native clients. |

Subpaths:

- `@vortex-api/convex-auth` — server-side auth API and configuration
- `@vortex-api/convex-auth/convex` — Convex native runtime entrypoints
- `@vortex-api/convex-auth/react` — React hooks and providers
- `@vortex-api/convex-auth/react-native` — Expo / React Native client
- `@vortex-api/convex-auth/nextjs`, `/nextjs/server` — Next.js SSR adapter
- `@vortex-api/convex-auth/tanstack-start`, `/tanstack-start/server` — TanStack Start adapter
- `@vortex-api/convex-auth/hono` — Hono server adapter
- `@vortex-api/convex-auth/mcp` — MCP OAuth helpers
- `@vortex-api/convex-auth/preflight` — deployment readiness checks
- `@vortex-api/convex-auth/testing` — test helpers

Published under the Apache-2.0 license.

## Development

This repo uses pnpm and [Vite+](https://github.com/voidzero-dev/vite_plus) (`vp`) for building, linting, and formatting. Documentation is generated with [Blume](https://useblume.dev) and hosted via [`@convex-dev/static-hosting`](https://github.com/get-convex/static-hosting) from the `site/` workspace.

```bash
pnpm install

pnpm run typecheck   # TypeScript across all packages
pnpm run lint        # Lint
pnpm run build       # Build all packages
pnpm run test        # Run all tests
pnpm run check       # Format + lint check
pnpm run fix         # Auto-fix lint and formatting
```

## CI and security scanning

A GitHub Actions workflow is defined in [`.github/workflows/ci.yml`](.github/workflows/ci.yml). It runs the full proof (`typecheck`, `check`, `build`, `test`) on Node 22, plus a forward-compat test pass on Node 24. Node 20 is EOL and unsupported.

The repo also includes repeatable security scanning:

```bash
pnpm run scan:security
```

This runs Semgrep, TruffleHog, Secretlint, and a dependency audit. The OAuth demo additionally validates authorization with live browser probes against the deployed demo.

## Releasing

This repo uses [Changesets](https://github.com/changesets/changesets). To publish a release:

1. Add a changeset for the affected packages:

```bash
pnpm changeset
```

2. Merge the resulting release PR that Changesets opens against `main`.

3. The [`release.yml`](.github/workflows/release.yml) workflow will version the packages, publish them to npm, and create GitHub releases. It needs an `NPM_TOKEN` repository secret.

## Attribution

The `convex-better-auth-adapter` package started from the community work in [`get-convex/better-auth`](https://github.com/get-convex/better-auth) and includes the Better Auth 1.7 migration from [`get-convex/better-auth#430`](https://github.com/get-convex/better-auth/pull/430). It is vendored here so the Convex + Better Auth bridge can keep pace with Better Auth releases while Convex Auth 2.0 matures. All original code remains under the Apache-2.0 license.

## License

Apache-2.0 — see `LICENSE`.

<!-- badges -->

[ci-badge]: https://img.shields.io/github/actions/workflow/status/VortexNYC/convex-auth/ci.yml?branch=main&style=for-the-badge&label=CI
[ci]: https://github.com/VortexNYC/convex-auth/actions/workflows/ci.yml
[npm-badge]: https://img.shields.io/npm/v/@vortex-api/convex-auth?style=for-the-badge&label=npm
[npm]: https://www.npmjs.com/package/@vortex-api/convex-auth
[docs-badge]: https://img.shields.io/badge/docs-online-292a44?style=for-the-badge
[docs]: https://your-deployment.convex.site
[license-badge]: https://img.shields.io/badge/license-Apache--2.0-blue.svg?style=for-the-badge
[license]: LICENSE
[status-badge]: https://img.shields.io/badge/status-public-blueviolet.svg?style=for-the-badge
[status]: #readme
[node-badge]: https://img.shields.io/badge/node->=22.0.0-brightgreen.svg?style=for-the-badge
[node]: package.json
[pnpm-badge]: https://img.shields.io/badge/pnpm-10.25.0-f69220.svg?style=for-the-badge
[pnpm]: package.json
