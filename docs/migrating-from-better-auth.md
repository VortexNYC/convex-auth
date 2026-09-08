# Migrating from Better Auth to Convex Auth 2.0

This repo is designed for a staged migration. You do not have to replace Better Auth in a single PR. The bridge packages (`convex-better-auth-adapter` and `convex-better-auth`) keep your existing auth working while you move the client, server, and data to the Convex-native runtime in `convex-auth`.

## Where you are starting from

Pick the starting point that matches your current app:

- **`@convex-dev/better-auth`** — follow [`migrating-from-convex-dev-better-auth.md`](./migrating-from-convex-dev-better-auth.md) first to move onto the vendored `convex-better-auth-adapter` package and Better Auth 1.7.x.
- **A custom Better Auth + Convex adapter** — switch to `convex-better-auth-adapter` first, then continue below.
- **`convex-better-auth` bridge already** — you can start migrating to `convex-auth` immediately.

## One-shot data migration

If both the legacy `convex-better-auth-adapter` component and the native `convex-auth` component are mounted in the same Convex app, you can migrate the legacy user, account, and session data in a single command:

```bash
pnpm dlx convex-auth migrate better-auth
```

The CLI reads legacy records from the adapter component and writes native records into the `convex-auth` component. It migrates users first, then accounts, then sessions. A successful run returns the `migrate:migrateUsers` batch status; accounts and sessions continue through the migration scheduler. Use `convex run --component betterAuth/migrations lib:getStatus` to watch the full set of migrations finish.

Flags:

- `--dry-run` — preview the file and deployment changes without writing anything.
- `--cutover` — after migration, rewrite `convex/convex.config.ts` and `convex/http.ts` to remove the legacy adapter and drop `convex-better-auth` / `convex-better-auth-adapter` from `package.json`.
- `--resume` — continue a previously started migration from the stored cursor. Without this flag, the migration resets and starts from the beginning.

After it finishes, verify the native tables in the mounted `convexAuth` component:

```bash
pnpm dlx convex data users --component convexAuth
pnpm dlx convex data auth_identities --component convexAuth
pnpm dlx convex data authAccounts --component convexAuth
pnpm dlx convex data authSessions --component convexAuth
```

Once the data is verified you can proceed with the staged client/server migration below, or drop the bridge packages immediately if you are already using the native runtime everywhere.

## Migration stages

### Stage 1 — Use the `convex-auth` component on the backend

The Convex-native runtime and the Better Auth bridge can share the same `convex-auth` component. Install the component first; the auth flow you use can move to native later.

```ts
// convex/auth.config.ts
import { createConvexAuthProvider } from "convex-auth/convex";

export default {
  providers: [createConvexAuthProvider()],
};
```

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

If you are already using the `convex-better-auth` bridge, this is the same component it already mounts.

### Stage 2 — Move server auth to `convexAuth`

Replace the Better Auth server setup with the native `convexAuth` API. You keep the same providers, OAuth, and email flows; they are now Convex actions and HTTP routes.

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
        console.log("Email draft", draft);
        return "email-id";
      },
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
  // ... everything else you need
} = auth;
```

```ts
// convex/http.ts
import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);

export default http;
```

`convexAuth` exposes the same feature surface you configured with Better Auth (email/password, OAuth, magic links, email OTP, 2FA) as Convex function references.

### Stage 3 — Move the React client to `convex-auth-react`

Replace `createAuthClient` from `better-auth` with the native Convex client.

```tsx
// src/main.tsx
import { ConvexReactClient, ConvexProvider } from "convex/react";
import { ConvexAuthProvider } from "convex-auth/react";
import { api } from "../convex/_generated/api";
import App from "./App";

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

Components then use `useAuthActions` instead of calling `authClient.signIn.email` directly:

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

  // ...
}
```

`convex-auth-react/client` still exports a `ConvexBetterAuthClient`-shaped client if you need to pass a client to older components, but for new code `ConvexAuthProvider` and `useAuthActions` are the intended APIs.

### Stage 4 — Move the React Native / Expo client

Use `ExpoConvexAuthProvider` from `convex-auth-react-native`:

```tsx
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ExpoConvexAuthProvider } from "convex-auth-react-native";
import { api } from "./convex/_generated/api";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!);

export default function Root() {
  return (
    <ConvexProvider client={convex}>
      <ExpoConvexAuthProvider
        actions={{
          signUp: api.auth.signUp,
          signIn: api.auth.signIn,
          signOut: api.auth.signOut,
        }}
      >
        <App />
      </ExpoConvexAuthProvider>
    </ConvexProvider>
  );
}
```

### Stage 5 — Drop the bridge packages

Once the native client and server are wired and tested, remove the Better Auth dependencies from `package.json`:

```bash
pnpm remove better-auth @better-auth/expo
pnpm remove convex-better-auth convex-better-auth-adapter
```

Your app then depends only on:

- `convex-auth`
- `convex-auth-react` (web)
- `convex-auth-react-native` (Expo / React Native)
- `convex`

The `convex-better-auth` and `convex-better-auth-adapter` packages can remain in your monorepo if other consumers still need the bridge, but the app itself no longer pulls `better-auth` at runtime.

## What does not need to change

- **B2B control-plane data** — users, sessions, identities, organizations, members, invitations, and permissions are already stored in your Convex database. The shape is the same whether you use the bridge or the native runtime.
- **UI shape** — the exported forms and hooks in `convex-auth-react` are modeled after the Better Auth `createAuthClient` contract, so component props and hook return values stay familiar.

## Verification

After each stage run the full proof from the repo root:

```bash
pnpm run typecheck
pnpm run check
pnpm run build
pnpm test
```

For Convex-specific linting also run:

```bash
pnpm run lint:convex
```
