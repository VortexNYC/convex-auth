# Examples

Each example is a runnable workspace under `examples/`. They share the same live `convex-auth` deployment and use `convex-auth` from the workspace.

Copy the `.env.example` in each example to `.env.local` and fill in your Convex deployment URL. If you want OAuth, also set the provider credentials on your deployment:

```bash
cp examples/oauth/.env.example examples/oauth/.env.local
pnpm dlx convex env set GITHUB_CLIENT_ID '...'
```

## React

`examples/react` is a Vite + React sign-up/sign-in form.

```bash
cd examples/react
pnpm install
pnpm run dev
```

The app uses `ConvexAuthClientProvider` and `useAuthActions` from `@vortex-api/convex-auth/react`:

```tsx
import { ConvexReactClient, ConvexProvider } from "convex/react";
import { ConvexAuthClientProvider } from "@vortex-api/convex-auth/react";
import { api } from "../convex/_generated/api";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

<ConvexProvider client={convex}>
  <ConvexAuthClientProvider actions={api.auth}>
    <App />
  </ConvexAuthClientProvider>
</ConvexProvider>;
```

## Server with Hono

`examples/server` shows email/password sign-in and OAuth redirect from a server using `hono` and `ConvexHttpClient`.

```bash
cd examples/server
pnpm install
pnpm run dev
```

```ts
import { Hono } from "hono";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const app = new Hono();
const convex = new ConvexHttpClient(process.env.CONVEX_URL);

app.post("/auth/sign-in", async (c) => {
  const { email, password } = await c.req.json();
  const session = await convex.action(api.auth.signIn, { email, password });
  return c.json(session);
});
```

## React Native / Expo

`examples/react-native` is a minimal Expo app using `@vortex-api/convex-auth/react-native`. See [React Native](./react-native) for setup details.

## OAuth

`examples/oauth` demonstrates Google, GitHub, and Discord sign-in. See [OAuth](./oauth) for provider configuration.

## Regenerating `_generated`

All examples use a committed `_generated` directory. If you point an example at your own deployment, run:

```bash
CONVEX_DEPLOYMENT=dev:<your-deployment> pnpm dlx convex codegen --typecheck=disable
```
