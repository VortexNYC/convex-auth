---
title: Migrating from Better Auth
description: One-time cutover from Better Auth to the native convex-auth runtime.
---

This is a one-time cutover, not a long-term bridge. The `convex-better-auth-adapter` and `convex-better-auth` packages are only used during the migration. Once the data is moved and the client/runtime is cut over, you remove them.

## What the cutover looks like

1. Mount the legacy `convex-better-auth-adapter` (`betterAuth`) component and the native `convex-auth` (`convexAuth`) component in the same Convex app.
2. Run the one-time data migration.
3. Cut over `convex/convex.config.ts` and `convex/http.ts` to native `convex-auth`.
4. Swap the React client to `@vortex-api/convex-auth/react`.
5. Remove `convex-better-auth` and `convex-better-auth-adapter` from `package.json`.

## What is and is not migrated

**Migrated:**

- Users (email, name, image, email verified status)
- Credential accounts (password hashes — Better Auth scrypt is supported)
- OAuth accounts (provider/issuer/subject, so the same social sign-in keeps working)
- Sessions are migrated as rows, but the old tokens are not usable. Users must sign in again.

**Not migrated:**

- TOTP 2FA secrets and backup codes. Migrated users have `twoFactorEnabled` set to `false` so they are not locked out. They must re-enroll in `convex-auth`.
- Passkeys, organizations, members, and other advanced Better Auth tables. These are not part of the one-time migration today.

## Prerequisites

- `convex` CLI installed
- pnpm and Node `>=20.12.0`
- A Better Auth 1.7.x setup on the vendored `convex-better-auth-adapter` (`0.13.5`)
- The native `convex-auth` component available (`1.7.6`)

## Step 1 — Mount both components

`convex/auth.config.ts`:

```ts
import { createConvexAuthProvider } from "@vortex-api/convex-auth/convex";

export default {
  providers: [createConvexAuthProvider()],
};
```

`convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import { v } from "convex/values";
import auth from "@vortex-api/convex-auth/convex.config";
import betterAuth from "convex-better-auth-adapter/convex.config";

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

app.use(betterAuth, { name: "betterAuth" });

export default app;
```

`convex/http.ts`:

```ts
import { httpRouter } from "convex/server";
import { auth } from "./auth";
import betterAuth from "convex-better-auth-adapter/http";

const http = httpRouter();
auth.addHttpRoutes(http);
betterAuth(http);

export default http;
```

Set the required environment variables on your Convex deployment:

```bash
convex env set JWT_PRIVATE_KEY '<private-key-json>'
convex env set JWKS '<jwks-json>'
convex env set BETTER_AUTH_SECRET '<better-auth-secret>'
convex env set EMAIL_FROM_ADDRESS 'auth@yourdomain.com'
```

## Step 2 — Run the data migration

```bash
pnpm dlx @vortex-api/convex-auth migrate better-auth
```

The CLI migrates users first, then accounts, then sessions. It is idempotent: re-running without `--resume` resets from the beginning. Use `--resume` to continue from the stored cursor.

Flags:

- `--dry-run` — preview the plan and legacy table counts without writing anything.
- `--resume` — continue a previously started migration from the stored cursor.
- `--cutover` — after migration, rewrite `convex/convex.config.ts` and `convex/http.ts` to remove the legacy adapter and drop `convex-better-auth` / `convex-better-auth-adapter` from `package.json`.
- `--batch-size <n>` — number of records per migration batch (default: 100).

After the CLI returns, the `migrate:migrateUsers` batch is done. Accounts and sessions continue in the background through the migration scheduler. Watch them with:

```bash
pnpm dlx convex run --component betterAuth/migrations lib:getStatus '{"names":["migrate:migrateUsers","migrate:migrateAccounts","migrate:migrateSessions"]}'
```

When all three are `success`, the data migration is complete.

## Step 3 — Verify migrated data

```bash
pnpm dlx convex data users --component convexAuth
pnpm dlx convex data auth_identities --component convexAuth
pnpm dlx convex data authAccounts --component convexAuth
pnpm dlx convex data authSessions --component convexAuth
```

Password users should be able to sign in through the native `convex-auth` HTTP routes (`/api/auth/sign-in/email`) with their existing passwords.

## Step 4 — Cut over the runtime

If you ran `pnpm dlx @vortex-api/convex-auth migrate better-auth --cutover`, the files were already rewritten. Otherwise, do it manually.

`convex/convex.config.ts` after cutover:

```ts
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

`convex/http.ts` after cutover:

```ts
import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);

export default http;
```

`convex/auth.ts` remains the same as the native setup:

```ts
import { components } from "./_generated/api";
import { convexAuth, type EmailDraft } from "@vortex-api/convex-auth/convex";

const siteUrl = process.env.CONVEX_SITE_URL?.replace(/\/+$/, "");

export const auth = convexAuth({
  component: components.convexAuth,
  emailAndPassword: {
    enabled: true,
    email: {
      from: process.env.EMAIL_FROM_ADDRESS ?? "auth@example.com",
      appOrigin: siteUrl,
      sendEmail: async (draft: EmailDraft) => {
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
} = auth;
```

## Step 5 — Swap the React client

Replace Better Auth’s client with `@vortex-api/convex-auth/react`:

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

Components use `useAuthActions` from `@vortex-api/convex-auth/react`:

```tsx
import { useAuthActions } from "@vortex-api/convex-auth/react";

export function SignIn() {
  const { signIn } = useAuthActions();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await signIn({
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="email" type="email" required />
      <input name="password" type="password" required />
      <button type="submit">Sign in</button>
    </form>
  );
}
```

## Step 6 — Remove the bridge packages

```bash
pnpm remove convex-better-auth convex-better-auth-adapter
```

Then remove any remaining Better Auth client imports and configuration from your app.

## Troubleshooting

### `invalid_email_or_password` after migration

The user’s password hash is probably from a format `convex-auth` does not yet support. The current release supports Better Auth’s default scrypt `salt:derivedKey` format. If you changed Better Auth’s password hashing, open an issue with the exact hash format.

### No migrated user found for legacy user

The migration ran accounts/sessions before users, or a user was added after the migration started. Re-run with the default (reset) behavior so users are migrated first.

### Sessions are not preserved

Migrated sessions are rows in the native `authSessions` table, but the tokens are not migrated. Users must sign in again and obtain new `convex-auth` tokens.

## Better Auth to convex-auth mapping

This document maps Better Auth concepts to the native `convex-auth` runtime. It is useful if you are migrating from Better Auth or comparing the two systems.

## What changed

`convex-auth` is now a fully native Convex auth runtime. It does not import or depend on `better-auth` at runtime. The `convex-better-auth-adapter` and `convex-better-auth` packages are used only for the one-time data and client migration.

## Mapping Better Auth plugins to `convex-auth`

| Better Auth plugin | `convex-auth` replacement                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| `organization`     | `packages/auth/src/component/organizations.ts` — orgs, members, invitations                       |
| `admin`            | `packages/auth/src/component/scopes.ts` and `servicePrincipals.ts` — roles and permissions        |
| `api-key`          | `packages/auth/src/component/apiKeys.ts` — API key issuance, rotation, and verification           |
| `two-factor`       | `packages/auth/src/component/identity.ts` — TOTP and backup codes                                 |
| `oauth-provider`   | `packages/auth/src/mcp.ts` and `agent-auth-protocol/` — MCP and agent auth flows                  |
| `webhooks`         | `packages/auth/src/component/webhooks.ts` — webhook fan-out and security                          |
| Authentication     | `convex-auth` native email/password, OAuth, session minting, JWT/JWKS, and password reset actions |

The data that used to live in Better Auth's adapter tables is now stored directly in the `convexAuth` component tables (`users`, `auth_identities`, `authAccounts`, `authSessions`, etc.).

## Migration terminology

| Better Auth term | `convex-auth` term                 | Notes                                                                                              |
| ---------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `user`           | `users`                            | Stored in the `convexAuth` component.                                                              |
| `account`        | `authAccounts` + `auth_identities` | Password and OAuth accounts are both identities.                                                   |
| `session`        | `authSessions`                     | Native JWT sessions, not Better Auth opaque sessions.                                              |
| `organization`   | `organizations` / `members`        | Convex-native B2B control plane.                                                                   |
| `apiKey`         | `authApiKeys`                      | API keys and service sessions.                                                                     |
| `twoFactor`      | `auth_identities.totp`             | TOTP secret and backup codes per identity.                                                         |
| `jwt`            | `JWT_PRIVATE_KEY` / `JWKS` env     | Convex signs and verifies tokens with `crypto.subtle` and `jose`.                                  |
| `oauth`          | Provider metadata + HTTP actions   | Google, GitHub, and Discord are built in; provider metadata is pure data, not a runtime framework. |

## What happens to the bridge packages after migration

Once the one-time migration finishes and the consumer cuts over to the native runtime, `convex-better-auth` and `convex-better-auth-adapter` are removed from `package.json`. They should not be used for new features or kept as a runtime dependency.

## Migrating from `@convex-dev/better-auth`

If you were using `@convex-dev/better-auth`, the move to this workspace is mostly a package-name change. The runtime semantics are the same; the adapter was vendored to keep it on the Better Auth 1.7 line and in the same repo as the higher-level Convex primitives.

## 1. Install the new package

```bash
pnpm remove @convex-dev/better-auth
pnpm add convex-better-auth-adapter
```

## 2. Update imports

Replace any imports from `@convex-dev/better-auth` with the same path under `convex-better-auth-adapter`:

```ts
// Before
import { convexClient } from "@convex-dev/better-auth/client/plugins";

// After
import { convexClient } from "convex-better-auth-adapter/client/plugins";
```

React / React Native provider imports also move:

```tsx
// Before
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";

// After
import { ConvexBetterAuthProvider } from "convex-better-auth-adapter/react";
```

## 3. Bump Better Auth to 1.7.x

Update your `package.json` to require `better-auth` in the `>=1.7.1 <1.8.0` range:

```json
{
  "dependencies": {
    "better-auth": "^1.7.2"
  }
}
```

The adapter is not compatible with Better Auth 1.6.x or earlier.

## 4. Account issuer migration

Better Auth 1.7 changed how the `account` table stores the provider issuer. The adapter includes a backfill path for existing data, but you should read the migration notes in the upstream PR that landed this work:

- [`get-convex/better-auth#430`](https://github.com/get-convex/better-auth/pull/430)

If you are starting a new project, no migration is needed — the 1.7 schema is used from the beginning.

## 5. React Native / Expo storage

If you use the Expo client, `@vortex-api/convex-auth/react-native` now wires the `expoClient` storage with both sync and async `SecureStore` methods. You should still pass a `SecureStore`-compatible object as `storage`, but the package no longer needs a custom sync-only wrapper.

## 6. Update your `convex` version

The rest of the workspace currently requires `convex >=1.39.0`. Make sure your app is on at least that version.

## 7. Run the full local proof

After the rename and bump, run:

```bash
pnpm install
pnpm run typecheck
pnpm run build
pnpm run test
```

If you were previously on Better Auth 1.6, read the [Better Auth 1.7 release notes](https://www.better-auth.com/changelog) first — there may be auth-options or plugin changes outside the adapter.

## Better Auth feature parity

Use this table to find the `convex-auth` equivalent for each Better Auth doc page. The implementation is different because auth state lives in Convex, but the feature surface is the same.

| Better Auth page                                                               | Convex Auth 2.0 equivalent                                                | `convex-auth` alternative                   |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------- |
| [Installation](https://www.better-auth.com/docs/installation)                  | [Setup](https://labs.convex.dev/auth/setup)                               | [`Quickstart`](./quickstart)                |
| [Basic usage / email & password](https://www.better-auth.com/docs/basic-usage) | [Passwords](https://labs.convex.dev/auth/config/passwords)                | [`Email and password`](./email-password)    |
| [Basic usage / social sign-on](https://www.better-auth.com/docs/basic-usage)   | [OAuth](https://labs.convex.dev/auth/config/oauth)                        | [`OAuth`](./oauth)                          |
| [Basic usage / session](https://www.better-auth.com/docs/basic-usage)          | [React client](https://labs.convex.dev/auth/api_reference/react)          | [`React client`](./client)                  |
| [Two-factor](https://www.better-auth.com/docs/plugins/two-factor)              | —                                                                         | [`Two-factor authentication`](./two-factor) |
| [Organizations](https://www.better-auth.com/docs/plugins/organization)         | —                                                                         | [`Organizations`](./organizations)          |
| [API keys](https://www.better-auth.com/docs/plugins/api-key)                   | —                                                                         | [`API keys`](./api-keys)                    |
| [Magic link](https://www.better-auth.com/docs/plugins/magic-link)              | [Magic links](https://labs.convex.dev/auth/config/email)                  | [`Magic links`](./magic-links)              |
| [Email OTP](https://www.better-auth.com/docs/plugins/email-otp)                | [OTPs](https://labs.convex.dev/auth/config/otps)                          | [`Email OTP`](./email-otp)                  |
| [Webhooks](https://www.better-auth.com/docs/concepts/webhooks)                 | —                                                                         | [`Webhooks`](./webhooks)                    |
| [Configuration / options](https://www.better-auth.com/docs/reference/options)  | [Server API reference](https://labs.convex.dev/auth/api_reference/server) | [`Configuration`](./configuration)          |

If a page is marked “coming next,” it has not been written yet. Open an issue or PR if you need it first.
