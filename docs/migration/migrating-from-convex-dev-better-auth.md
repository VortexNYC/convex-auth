---
title: Migrating from `@convex-dev/better-auth`
description: "One-time migration from the Convex Better Auth component to the native convex-auth runtime."
---

# Migrating from `@convex-dev/better-auth`

`convex-auth` is a fully native Convex auth runtime. It does not import or depend on `better-auth` at runtime. Better Auth is used only once — as a data bridge during migration.

The migration is intentionally a single step. After it finishes, consumers remove the Better Auth dependencies.

## Before you start

Read the [Better Auth to `convex-auth` mapping](../from-better-auth/better-auth-to-convex) so the terminology differences are clear:

- `user` → `users`
- `account` → `auth_identities` + `authAccounts`
- `session` → `authSessions`
- `organization` → `organizations` / `organization_members`
- `apiKey` → `api_keys` + `service_principals`
- `jwt` → Convex `JWT_PRIVATE_KEY` / JWKS

## 1. Install the native packages

```bash
pnpm add convex-auth convex-auth-react
pnpm remove @convex-dev/better-auth better-auth
```

Keep the legacy packages around only for the one-time migration if you have live user data to move.

## 2. Configure `convex-auth`

`convex/convex.config.ts`

```ts
import { defineApp } from "convex/server";
import convexAuth from "convex-auth/convex.config";

const app = defineApp();
app.use(convexAuth);

export default app;
```

`convex/auth.ts`

```ts
import { convexAuth } from "convex-auth/convex";
import { components } from "./_generated/api";

export const { auth, emailAndPassword, oauth } = convexAuth(components.convexAuth, {
  emailAndPassword: { enabled: true },
  oauth: { enabled: true },
});
```

`convex/http.ts`

```ts
import { httpRouter } from "convex/server";
import { addNativeAuthHttpRoutes } from "convex-auth/convex";

const http = httpRouter();
addNativeAuthHttpRoutes(http, { auth });
export default http;
```

`src/main.tsx`

```tsx
import { ConvexReactClient, ConvexProvider } from "convex/react";
import { ConvexAuthClientProvider } from "convex-auth/react";
import { api } from "../convex/_generated/api";

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

## 3. Run the one-time migration CLI

The migration CLI copies data from the Better Auth Convex component tables into the `convexAuth` component tables.

Dry run first:

```bash
pnpm dlx convex-auth migrate better-auth --dry-run \
  --from-component betterAuth \
  --auth-component convexAuth
```

If the dry run looks right, run the cutover:

```bash
pnpm dlx convex-auth migrate better-auth --cutover \
  --from-component betterAuth \
  --auth-component convexAuth
```

`--cutover` rewrites `convex/convex.config.ts` and `convex/http.ts` to the native runtime and removes the legacy packages from `package.json`.

If the migration is interrupted, resume with:

```bash
pnpm dlx convex-auth migrate better-auth --resume
```

## 4. Remove Better Auth dependencies

After the cutover completes and the app is verified:

```bash
pnpm remove better-auth @convex-dev/better-auth convex-better-auth convex-better-auth-adapter
```

## 5. Update client code

Replace Better Auth client calls with `convex-auth` hooks and actions.

```tsx
// Before
import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";

const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL,
  plugins: [convexClient()],
});

await authClient.signIn.email({ email, password });

// After
import { useAuthActions } from "convex-auth/react";

const { signIn } = useAuthActions();
await signIn.email({ email, password });
```

See the [React client guide](../frameworks/client) and [React Native guide](../frameworks/react-native) for the full API.

## 6. Run the full proof

```bash
pnpm install
pnpm run typecheck
pnpm run build
pnpm run test
```

Then run the conformance suite against a live deployment:

```bash
CONVEX_SITE_URL=https://<your>.convex.site \
CONVEX_URL=https://<your>.convex.cloud \
pnpm dlx tsx ./node_modules/convex-auth/conformance/prove-auth-lifecycle.ts
```

## What is not migrated

- **Plugins that are not natively implemented** must be re-implemented against `convex-auth` actions. See [plugin parity](../from-better-auth/better-auth-to-convex).
- **Frameworks without a guide** (Next.js, TanStack Start, SvelteKit) are not yet supported by `convex-auth`. Use the React client as a stopgap in non-SSR mode, or wait for the framework-specific package.
- **Local install / schema customizations** from `@convex-dev/better-auth` do not carry over. The native schema is fixed per `convex-auth` version.
