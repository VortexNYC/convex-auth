# `examples/react`

A full-featured Vite + React demo of `convex-auth`, intended for the Convex Components Directory. It exercises the same package APIs a production app uses.

## Features

- **Email & password** — sign up, sign in, forgot/reset, and email verification.
- **OAuth** — Google, GitHub, and Discord sign-in.
- **OIDC Provider** — `convex-auth` acting as an OAuth 2.1 / OpenID Connect provider with authorization-code + PKCE flow, consent screen, and callback.
- **Two-factor authentication** — TOTP setup, backup codes, and challenge flow.
- **Passkeys** — WebAuthn sign-in (where the browser supports it).
- **Sessions** — list and revoke sessions.
- **Organizations / workspaces** — create, switch, and manage organizations.
- **API keys** — create and manage scoped API keys.
- **Service principals & webhooks** — organization-scoped service accounts and webhook endpoints.

## Live demo

The reference deployment runs on Convex static hosting. Replace `<your-deployment>` with your own Convex deployment:

```text
https://<your-deployment>.convex.site
```

## Setup

1. Copy `.env.example` to `.env.local` and fill in your Convex deployment:

   ```bash
   cp .env.example .env.local
   ```

2. Set your Convex environment variables:

   ```bash
   pnpm dlx convex env set VITE_CONVEX_URL 'https://<your-deployment>.convex.cloud'
   pnpm dlx convex env set CONVEX_DEPLOYMENT 'dev:<your-deployment>'
   pnpm dlx convex env set VITE_CONVEX_SITE_URL 'https://<your-deployment>.convex.site'
   ```

3. Configure the built-in OAuth providers (Google, GitHub, Discord) as shown in `convex/auth.ts`:

   ```bash
   pnpm dlx convex env set GOOGLE_CLIENT_ID '...'
   pnpm dlx convex env set GOOGLE_CLIENT_SECRET '...'
   pnpm dlx convex env set GITHUB_CLIENT_ID '...'
   pnpm dlx convex env set GITHUB_CLIENT_SECRET '...'
   pnpm dlx convex env set DISCORD_CLIENT_ID '...'
   pnpm dlx convex env set DISCORD_CLIENT_SECRET '...'
   ```

4. Optionally enable the OIDC provider demo by setting the client variables from `.env.example`.

5. Install and run locally:

   ```bash
   pnpm install
   pnpm dev
   ```

## Deploy the React demo

This example uses `@convex-dev/static-hosting` to serve the built React app from your Convex site origin.

```bash
# 1. Start local Convex dev and generate bindings
pnpm dlx convex dev --once

# 2. Build the app
pnpm build

# 3. Upload the dist folder to Convex storage
pnpm dlx @convex-dev/static-hosting upload --dist ./dist --component staticHosting
```

The app will be available at `https://<your-deployment>.convex.site`.
