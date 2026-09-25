# Examples

Each example is a runnable workspace under `examples/` and uses `convex-auth` from the workspace. Give each example its own Convex deployment — examples deploy different function sets and static assets, so two examples pointed at one deployment overwrite each other.

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

## TanStack Router

`examples/tanstack-router` is a Vite + React app using `@tanstack/react-router` with file-based routing. It shows the client-side auth integration pattern: `useSession()` state is mirrored into the router `context`, a pathless `_authed` layout guards protected routes in `beforeLoad` (redirecting to `/sign-in?redirect=…`), and `router.invalidate()` re-runs the guards on sign-in/sign-out.

```tsx
function InnerApp() {
  const { isLoading, isAuthenticated } = useSession();
  useEffect(() => {
    void router.invalidate();
  }, [isLoading, isAuthenticated]);
  return <RouterProvider router={router} context={{ auth: { isLoading, isAuthenticated } }} />;
}

export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context, location }) => {
    if (context.auth.isLoading) return;
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    }
  },
});
```

```bash
cd examples/tanstack-router
pnpm install
pnpm dlx convex dev   # anonymous local backend
pnpm run dev
```

Anonymous local backends default to `127.0.0.1:3210`/`3211`. To run several local examples at once, give each `.env.local` its own port pair (e.g. `3214`/`3215`) before the first `convex dev` — the backend binds the ports in `CONVEX_URL`/`CONVEX_SITE_URL`.

## TanStack Start (SSR)

`examples/tanstack-start` is a full SSR app using `@tanstack/react-start` and the `@vortex-api/convex-auth/tanstack-start` adapter. Sessions live in app-origin HttpOnly cookies; every request passes through `convexAuthRequestMiddleware`, which also serves the intent-based `/api/auth` proxy.

```ts
// src/start.ts
import { createStart } from "@tanstack/react-start";
import { convexAuthRequestMiddleware } from "@vortex-api/convex-auth/tanstack-start/server";
import { api } from "../convex/_generated/api";

export const startInstance = createStart(() => ({
  requestMiddleware: [convexAuthRequestMiddleware({ actions: api.auth })],
}));
```

The root route resolves the verified session in `beforeLoad` and seeds `ConvexAuthTanstackStartProvider` (cookie mode). A pathless `_authed` route guards navigation as UX, while protected `createServerFn`s declare `convexAuthFunctionMiddleware`, which attaches the revocation-aware `context.session` — the real security boundary.

```tsx
const getDashboardData = createServerFn({ method: "GET" })
  .middleware([convexAuthFunctionMiddleware({ actions: api.auth })])
  .handler(async ({ context }) => {
    if (context.session === null) throw new Error("Unauthorized");
    return { user: context.session.user };
  });
```

```bash
cd examples/tanstack-start
pnpm install
pnpm dlx convex dev   # local backend on :3212
pnpm run dev          # app on :3200
```

## Next.js (SSR)

`examples/nextjs` exercises `@vortex-api/convex-auth/nextjs` end-to-end: HttpOnly cookie sessions, middleware refresh, the `/api/auth` proxy, and server-rendered session state — no token ever touches browser JavaScript.

```ts
// middleware.ts
import { convexAuthNextjsMiddleware } from "@vortex-api/convex-auth/nextjs/server";
import { api } from "./convex/_generated/api";

export default convexAuthNextjsMiddleware({ actions: api.auth });
```

```bash
cd examples/nextjs
pnpm install
pnpm dlx convex dev --dev-deployment local   # local backend on :3210
pnpm run dev
```

See the [Next.js guide](./nextjs) for the full middleware, server provider, and session helper setup.

## Server with Hono

`examples/server` shows email/password sign-in and OAuth redirect from a server using `hono` and `ConvexHttpClient` — the token-mode reference for servers that do not need cookie sessions.

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

## Hono (adapter)

`examples/hono` is the same Hono server shape but on the packaged `@vortex-api/convex-auth/hono` adapter — same-origin HttpOnly cookie sessions, the `/api/auth` proxy, and the verified session oracle via `convexAuthMiddleware`.

```ts
import { Hono } from "hono";
import { convexAuthMiddleware } from "@vortex-api/convex-auth/hono";
import { api } from "../convex/_generated/api";

const app = new Hono();
app.use("*", convexAuthMiddleware({ actions: api.auth }));
```

```bash
cd examples/hono
pnpm install
pnpm run dev
```

See the [Hono guide](./hono) for session helpers and proxy options.

## React Native / Expo

`examples/react-native` is a minimal Expo app using `@vortex-api/convex-auth/react-native`. See [React Native](./react-native) for setup details.

## OAuth

`examples/oauth` demonstrates Google, GitHub, and Discord sign-in. See [OAuth](./oauth) for provider configuration.

## Regenerating `_generated`

All examples use a committed `_generated` directory. If you point an example at your own deployment, run:

```bash
CONVEX_DEPLOYMENT=dev:<your-deployment> pnpm dlx convex codegen --typecheck=disable
```
