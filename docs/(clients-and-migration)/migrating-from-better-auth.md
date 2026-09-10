# Migrating from Better Auth to `convex-auth`

This is a one-time cutover, not a long-term bridge. The `convex-better-auth-adapter` and `convex-better-auth` packages are only used during the migration. Once the data is moved and the client/runtime is cut over, you remove them.

## What the cutover looks like

1. Mount the legacy `convex-better-auth-adapter` (`betterAuth`) component and the native `convex-auth` (`convexAuth`) component in the same Convex app.
2. Run the one-time data migration.
3. Cut over `convex/convex.config.ts` and `convex/http.ts` to native `convex-auth`.
4. Swap the React client to `convex-auth/react`.
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

Replace Better Auth’s client with `convex-auth/react`:

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

Components use `useAuthActions` from `convex-auth/react`:

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
