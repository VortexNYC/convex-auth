# OAuth

`convex-auth` supports Google, GitHub, and Discord OAuth out of the box. These are the initial built-in examples; the longer-term goal is parity with every provider Better Auth supports. The flow uses server-side state and PKCE.

1. The client calls `signInWithRedirect({ provider, callbackURL, errorURL })`.
2. `convex-auth` returns a provider authorization URL.
3. The browser redirects to the provider.
4. The provider redirects to `https://<your-convex-site>/api/auth/callback/<provider>`.
5. `convex-auth` exchanges the code and redirects the browser to `callbackURL` with `?token=...&sessionId=...`.

## Callback URLs

Register this callback URL in each provider's developer console:

```
https://<CONVEX_SITE_URL>/api/auth/callback/<provider>
```

For an example deployment `your-deployment`:

- GitHub: `https://<your-deployment>.convex.site/api/auth/callback/github`
- Google: `https://<your-deployment>.convex.site/api/auth/callback/google`
- Discord: `https://<your-deployment>.convex.site/api/auth/callback/discord`

If you run locally without `CONVEX_SITE_URL`, `convex/auth.ts` falls back to `http://localhost:3000`, so the callback path becomes `http://localhost:3000/api/auth/callback/<provider>`.

## Get your provider credentials

### GitHub

1. Go to [GitHub Developer settings → OAuth Apps](https://github.com/settings/developers).
2. Click **New OAuth App**.
3. Set the **Authorization callback URL** to `https://<your-site>/api/auth/callback/github`.
4. Copy the **Client ID** and **Client Secret**.

### Google

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. Click **Create credentials → OAuth client ID**.
3. Choose **Web application**.
4. Under **Authorized redirect URIs**, add `https://<your-site>/api/auth/callback/google`.
5. Copy the **Client ID** and **Client Secret**.

### Discord

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create or select an application.
3. In **OAuth2 → Redirects**, add `https://<your-site>/api/auth/callback/discord`.
4. Copy the **Client ID** and **Client Secret**.

## Set environment variables

Set the credentials on your Convex deployment:

```bash
pnpm dlx convex env set GITHUB_CLIENT_ID '...'
pnpm dlx convex env set GITHUB_CLIENT_SECRET '...'
pnpm dlx convex env set GOOGLE_CLIENT_ID '...'
pnpm dlx convex env set GOOGLE_CLIENT_SECRET '...'
pnpm dlx convex env set DISCORD_CLIENT_ID '...'
pnpm dlx convex env set DISCORD_CLIENT_SECRET '...'
```

## Configure `convex/auth.ts`

```ts
import { components } from "./_generated/api";
import { convexAuth } from "convex-auth/convex";

export const auth = convexAuth({
  component: components.convexAuth,
  emailAndPassword: { enabled: true },
  oauth: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
    },
  },
});
```

## Start the OAuth flow from React

Use the `signInWithRedirect` action from `api.auth`:

```tsx
import { useAction } from "convex/react";

function OAuthButtons() {
  const start = useAction(api.auth.signInWithRedirect);

  const startOAuth = async (provider: "google" | "github" | "discord") => {
    const { url } = await start({
      provider,
      callbackURL: `${window.location.origin}/auth/callback`,
      errorURL: `${window.location.origin}/auth/error`,
    });
    window.location.href = url;
  };

  return (
    <>
      <button onClick={() => startOAuth("google")}>Sign in with Google</button>
      <button onClick={() => startOAuth("github")}>Sign in with GitHub</button>
      <button onClick={() => startOAuth("discord")}>Sign in with Discord</button>
    </>
  );
}
```

`signInWithRedirect` returns a `{ url }` object. Redirect the browser to that URL. From a server, call the action and redirect the browser to the returned URL yourself.

## Callback handling

Convex already exposes the callback at `/api/auth/callback/:provider` through `auth.addHttpRoutes(http)`. The provider redirects there, the token is issued, and the browser is redirected to `callbackURL` with `?token=...&sessionId=...`.

Your frontend should read the token from the query string and pass it to the provider:

```tsx
import { useEffect } from "react";
import { useAuthActions } from "convex-auth/react";

function OAuthCallback() {
  const { updateSession } = useAuthActions();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
      void updateSession({ token });
    }
  }, [updateSession]);

  return <p>Finishing sign-in...</p>;
}
```

## Server-side OAuth

From a Hono server:

```ts
import { Hono } from "hono";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);
const app = new Hono();

app.post("/auth/oauth/:provider", async (c) => {
  const provider = c.req.param("provider");
  const { url } = await convex.action(api.auth.signInWithRedirect, {
    provider,
    callbackURL: `${process.env.APP_URL}/auth/callback`,
  });
  return c.json({ url });
});
```
