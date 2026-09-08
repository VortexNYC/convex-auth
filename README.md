<div align="center">

# convex-better-auth-2.0

A public, Convex-native auth platform for [Convex](https://convex.dev), with a [Better Auth](https://www.better-auth.com) compatibility bridge.

> **Disclaimer:** This is an independent, community-driven project. It is not affiliated with or endorsed by Convex Inc.

[![CI][ci-badge]][ci]
[![Docs][docs-badge]][docs]
[![License][license-badge]][license]
[![Status][status-badge]][status]
[![Node][node-badge]][node]
[![pnpm][pnpm-badge]][pnpm]

**[Docs](https://gregarious-perch-710.convex.site)** · **[Why this exists](#why-this-exists)** · **[Packages](#packages)** · **[Convex-native auth](#convex-native-auth-recommended)**

</div>

---

## Status

Public — `convex-auth` is at `1.7.5`, `convex-better-auth-adapter` is at `0.13.4`, and `convex-better-auth` is at `2.0.5`. The Convex-native runtime (email/password, Google/GitHub/Discord OAuth, TOTP 2FA, backup codes, trusted devices, sessions, refresh tokens, organizations, API keys, webhooks, and MCP auth) is passing full conformance. The Better Auth compatibility bridge is stable for one-time migration only.

## Why this exists

Convex is building the future of auth, but it is not there yet. Better Auth has the most complete feature set today, but it is not designed around Convex's component, query, and mutation model. Most teams who try to combine the two end up rewriting the same glue and making the same security mistakes.

This repo is the pragmatic middle path:

1. **Convex-native auth is the end state.** Authentication state (users, sessions, identities, organizations, permissions, API keys, and more) lives in your Convex database and is accessed through components, queries, mutations, and actions.
2. **Better Auth is a one-time migration bridge, not the final runtime.** The `convex-better-auth-adapter` and `convex-better-auth` packages let existing Better Auth users move to Convex tables and the native runtime in a single cutover. We do not keep real-time translation between the two after migration.
3. **We are not copying Convex Auth 2.0.** We are learning from its design constraints and shipping our own implementation that preserves the B2B surface we have already built.

Read the full rationale in [`docs/motivation.md`](docs/motivation.md) and the design details in [`docs/better-auth-to-convex.md`](docs/better-auth-to-convex.md).

## Packages

| Package                      | npm                          | Path                           | Description                                                                                          |
| ---------------------------- | ---------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `convex-auth`                | `convex-auth`                | `packages/auth`                | Convex auth component, control plane, and native server integration. This is what most apps install. |
| `convex-auth-react`          | `convex-auth-react`          | `packages/react`               | React UI and hooks.                                                                                  |
| `convex-auth-react-native`   | `convex-auth-react-native`   | `packages/react-native`        | Expo / React Native client.                                                                          |
| `convex-auth-core`           | `convex-auth-core`           | `packages/core`                | Auth domain core (permissions, roles, scopes).                                                       |
| `convex-auth-ui`             | `convex-auth-ui`             | `packages/ui`                  | Base shadcn-style UI primitives.                                                                     |
| `convex-better-auth`         | `convex-better-auth`         | `packages/better-auth`         | Better Auth compatibility bridge (runtime + client).                                                 |
| `convex-better-auth-adapter` | `convex-better-auth-adapter` | `packages/better-auth-adapter` | Low-level Better Auth ↔ Convex adapter, vendored and maintained here.                                |

All packages are independently buildable and published under the Apache-2.0 license.

## Convex-native auth (recommended)

`convex-auth` ships a Convex-native auth runtime that stores users, sessions, and identities in your Convex database and runs in the default Convex isolate. It supports email/password, Google/GitHub/Discord OAuth, 2FA, email verification, password reset, sessions, and refresh tokens. No Better Auth server is required.

The native flow is the intended end state of this repository. The Better Auth bridge below is still available for teams that need it while migrating.

### 1. Install

```bash
pnpm add convex-auth convex-auth-react convex
```

### 2. Set environment variables

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

For email and OAuth, also set:

```bash
convex env set CONVEX_SITE_URL 'https://your-site.convex.site'
convex env set EMAIL_FROM_ADDRESS 'auth@yourdomain.com'
convex env set GITHUB_CLIENT_ID '...'
convex env set GITHUB_CLIENT_SECRET '...'
convex env set GOOGLE_CLIENT_ID '...'
convex env set GOOGLE_CLIENT_SECRET '...'
convex env set DISCORD_CLIENT_ID '...'
convex env set DISCORD_CLIENT_SECRET '...'
```

### 3. Create `convex/auth.config.ts`

```ts
// convex/auth.config.ts
import { createConvexAuthProvider } from "convex-auth/convex";

export default {
  providers: [createConvexAuthProvider()],
};
```

### 4. Mount the component

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import { v } from "convex/values";
import auth from "convex-auth/convex.config";

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

### 5. Configure auth in `convex/auth.ts`

```ts
// convex/auth.ts
import { components } from "./_generated/api";
import { convexAuth, type EmailDraft } from "convex-auth/convex";

const siteUrl = process.env.CONVEX_SITE_URL?.replace(/\/$/, "");

export const auth = convexAuth({
  component: components.convexAuth,
  emailAndPassword: {
    enabled: true,
    email: {
      from: process.env.EMAIL_FROM_ADDRESS ?? "auth@example.com",
      appOrigin: siteUrl,
      sendEmail: async (draft: EmailDraft) => {
        // Send via Resend/Postmark/SES in production.
        // For local dev you can log and return a dummy id.
        console.log("Email draft", draft);
        return "email-id";
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

### 6. Wire HTTP routes in `convex/http.ts`

```ts
// convex/http.ts
import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);

export default http;
```

### 7. Wrap the React app

```tsx
// src/main.tsx
import { ConvexReactClient, ConvexProvider } from "convex/react";
import { ConvexAuthClientProvider } from "convex-auth/react";
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

### 8. Use the actions in components

```tsx
// src/SignIn.tsx
import { useAuthActions } from "convex-auth/react";

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

### 9. Validate your setup

The `convex-auth` CLI ships with `check` (consumer contract) and `preflight` (live install verification):

```bash
pnpm dlx convex-auth check
pnpm dlx convex-auth preflight
```

`check` validates that your `convex/` files do not accidentally import internal exports. `preflight` verifies that `VITE_CONVEX_URL` / `CONVEX_URL`, `CONVEX_SITE_URL`, and the component mount are set up correctly.

Email verification and password reset are one-click via the `/api/auth/verify-email` and `/api/auth/reset-password/:token` HTTP routes. The user clicks the link, the route validates the token, and the browser is redirected to `callbackURL` with the token (reset only) or success state (verification). In production `sendEmail` should call Resend/Postmark/SES/etc.

See `packages/conformance-consumer` for a working deployment with email capture and OAuth stubs, and [`docs/convex-native-auth-strategy.md`](docs/convex-native-auth-strategy.md) for the long-term roadmap.

## Better Auth bridge (for migration)

If you are already using Better Auth and want to migrate to Convex tables and the native runtime in a single step, the Better Auth compatibility bridge is available. Run the migration, cut over the runtime, then remove `convex-better-auth` and `convex-better-auth-adapter` from your dependencies.

### Convex component

During the migration, mount the legacy `betterAuth` adapter component and the native `convexAuth` component together. The exact `convex/convex.config.ts` wiring is in [`docs/migrating-from-better-auth.md`](docs/migrating-from-better-auth.md). After the cutover, you remove the legacy adapter and keep only the `convex-auth` component shown in the native section above.

### React client

The bridge does not add a new React provider. While you are running both Better Auth and `convex-auth` side by side, use Better Auth's own client. The low-level Convex helper is:

```ts
import { createBetterAuthConvexClient } from "convex-better-auth";

export const authClient = createBetterAuthConvexClient({
  baseURL: "https://your-site.convex.site/api/auth",
});
```

After the cutover to the native runtime, swap to the `convex-auth/react` client and `ConvexAuthClientProvider` shown in the [Convex-native auth section](#convex-native-auth-recommended).

## Compatibility and migration

- See [`docs/compatibility.md`](docs/compatibility.md) for the current supported versions of Better Auth, Convex, React, React Native / Expo, Node, and pnpm.
- See [`docs/migrating-from-better-auth.md`](docs/migrating-from-better-auth.md) for the staged migration from a Better Auth setup to the native `convex-auth` runtime.
- See [`docs/migrating-from-convex-dev-better-auth.md`](docs/migrating-from-convex-dev-better-auth.md) if you are moving from `@convex-dev/better-auth` to `convex-better-auth-adapter`.

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

## CI

A GitHub Actions workflow is defined in [`.github/workflows/ci.yml`](.github/workflows/ci.yml). It runs the full proof (`typecheck`, `check`, `build`, `test`) on Node 20.12+ and Node 22.

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

[ci-badge]: https://img.shields.io/github/actions/workflow/status/shlomokabareti/convex-better-auth-2.0/ci.yml?branch=main&style=for-the-badge&label=CI
[ci]: https://github.com/shlomokabareti/convex-better-auth-2.0/actions/workflows/ci.yml
[docs-badge]: https://img.shields.io/badge/docs-online-292a44?style=for-the-badge
[docs]: https://gregarious-perch-710.convex.site
[license-badge]: https://img.shields.io/badge/license-Apache--2.0-blue.svg?style=for-the-badge
[license]: LICENSE
[status-badge]: https://img.shields.io/badge/status-public-blueviolet.svg?style=for-the-badge
[status]: #status
[node-badge]: https://img.shields.io/badge/node->=20.12.0-brightgreen.svg?style=for-the-badge
[node]: package.json
[pnpm-badge]: https://img.shields.io/badge/pnpm-10.25.0-f69220.svg?style=for-the-badge
[pnpm]: package.json
