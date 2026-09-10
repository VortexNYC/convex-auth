---
name: convex-auth
displayName: Convex Auth
description: Guidelines for building with the convex-auth native runtime and migrating from Better Auth in the convex-auth repo.
version: 1.0.0
author: Shlomo Kabareti
tags: [convex, auth, better-auth, migration, components]
---

# Convex Auth

This skill covers the `convex-auth` native runtime in the `convex-auth` repo. It is for humans and agents who need to understand the architecture, wire a consumer, or migrate from Better Auth.

## Philosophy

- **Convex-native auth is the end state.** Users, sessions, identities, organizations, permissions, and API keys live in your Convex database and are accessed through components, queries, mutations, and actions.
- **Better Auth is a migration bridge, not the runtime.** `convex-better-auth` and `convex-better-auth-adapter` exist to migrate data once, then be removed.
- **No runtime Better Auth dependency for `convex-auth`.** New projects install `convex-auth` directly and never import `better-auth` at runtime.

## Package Map

| Package                      | What it is                                                 | Install when                                  |
| ---------------------------- | ---------------------------------------------------------- | --------------------------------------------- |
| `convex-auth`                | Convex-native auth component, server integration, and CLI. | Every native app.                             |
| `convex-auth-react`          | React UI, hooks, and providers.                            | React web apps.                               |
| `convex-auth-react-native`   | Expo / React Native client.                                | React Native / Expo apps.                     |
| `convex-auth-core`           | Auth domain core: permissions, roles, scopes, principals.  | If you need permission primitives outside UI. |
| `convex-auth-ui`             | shadcn-style UI primitives.                                | If you use the React UI.                      |
| `convex-better-auth`         | Better Auth runtime bridge (migration-only).               | During a staged migration.                    |
| `convex-better-auth-adapter` | Better Auth ↔ Convex database adapter.                     | During a staged migration.                    |

## Architecture Decisions

- **Identity-first schema.** `auth_identities` is the canonical table for password and OAuth-linked accounts. Do not rename it to `authAccounts` or flatten OAuth token fields; scoped sessions and refresh flows depend on this shape.
- **Component-first config.** Consumers register `convex-auth/convex.config` in `convex/convex.config.ts`, then call `convexAuth({ component, emailAndPassword, oauth })` in `convex/auth.ts`.
- **Explicit action refs, no `store`.** `convexAuth` returns typed `signIn`, `signUp`, `signOut`, `sendEmailVerification`, `verifyEmail`, `sendPasswordReset`, `resetPassword`, 2FA actions, `isAuthenticated`, and `verifySession`. The React provider and HTTP routes call these directly.
- **Three OAuth providers for now.** Google, GitHub, and Discord are the supported native OAuth providers. Expand only after the core is stable.
- **One-time migration from Better Auth.** Data is copied from Better Auth adapter tables to `convex-auth` tables once. After cutover, the bridge packages are uninstalled.

## Native Setup

### 1. Install

```bash
pnpm add convex-auth convex-auth-react convex
```

### 2. Environment variables

```bash
convex env set JWT_PRIVATE_KEY '...'      # JSON RS256 private key JWK
convex env set JWKS '...'                  # Public key JWKS
convex env set CONVEX_SITE_URL 'https://your-site.convex.site'
convex env set EMAIL_FROM_ADDRESS '...'
convex env set GITHUB_CLIENT_ID '...'
convex env set GITHUB_CLIENT_SECRET '...'
convex env set GOOGLE_CLIENT_ID '...'
convex env set GOOGLE_CLIENT_SECRET '...'
convex env set DISCORD_CLIENT_ID '...'
convex env set DISCORD_CLIENT_SECRET '...'
```

### 3. Mount the component

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

### 4. Configure auth

```ts
// convex/auth.ts
import { components } from "./_generated/api";
import { convexAuth, type EmailDraft } from "convex-auth/convex";

const siteUrl = process.env.CONVEX_SITE_URL?.replace(/\/$/, "");

export const auth = convexAuth({
  component: components.convexAuth,
  emailAndPassword: {
    enabled: true,
    checkBreach: true,
    email: {
      from: process.env.EMAIL_FROM_ADDRESS ?? "auth@example.com",
      appOrigin: siteUrl,
      sendEmail: async (draft: EmailDraft) => {
        // Resend/Postmark/SES in production
        console.log("Email draft", draft);
        return "email-id";
      },
      sendOnSignUp: true,
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
  sendEmailVerification,
  verifyEmail,
  sendPasswordReset,
  resetPassword,
} = auth;
```

### 5. HTTP routes

```ts
// convex/http.ts
import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);

export default http;
```

### 6. React client

```tsx
// src/main.tsx
import { ConvexReactClient, ConvexProvider } from "convex/react";
import { ConvexAuthProvider } from "convex-auth/react";
import { api } from "../convex/_generated/api";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

function Root() {
  return (
    <ConvexProvider client={convex}>
      <ConvexAuthProvider
        actions={{
          signUp: api.auth.signUp,
          signIn: api.auth.signIn,
          signOut: api.auth.signOut,
        }}
      >
        <App />
      </ConvexAuthProvider>
    </ConvexProvider>
  );
}
```

## Validate

```bash
pnpm dlx convex-auth check     # consumer contract (static)
pnpm dlx convex-auth preflight # live install + deployment checks
```

## Migrating from Better Auth

1. Start with `convex-better-auth-adapter` on Better Auth `>=1.7.1 <1.8.0`.
2. Run the one-time migration actions to copy users, sessions, and identities into `convex-auth` tables.
3. Verify the data, switch the client to `convex-auth-react`, and remove `better-auth`.
4. See `docs/migrating-from-better-auth.md` and `docs/decisions/ADR-002-one-time-better-auth-migration.md`.

## Common Pitfalls

- **Importing from internal paths.** Only import from package subpaths (`convex-auth/convex`, `convex-auth/react`, etc.). Internal `src/` paths are not public.
- **Using `filter()` on `auth*` tables.** Follow `@convex-dev/eslint-plugin` and use `withIndex`.
- **Forgetting `CONVEX_SITE_URL`.** OAuth and magic-link flows need it for redirect URIs.
- **Keeping `better-auth` after cutover.** The goal is to uninstall it; do not leave it as a permanent peer.
- **Misplacing `convex-auth` checks in `withIndex` paths.** Use `convex-auth check` before committing wiring changes.

## References

- `docs/motivation.md`
- `docs/convex-native-auth-strategy.md`
- `docs/decisions/ADR-001-convex-auth-2.0-alignment.md`
- `docs/decisions/ADR-002-one-time-better-auth-migration.md`
- `docs/compatibility.md`
- `packages/conformance-consumer` — working deployment fixture
