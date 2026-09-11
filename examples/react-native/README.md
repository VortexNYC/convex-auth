# `examples/react-native`

A real Expo / React Native example that runs on iOS, Android, and in the Expo Go client. It uses `expo-secure-store` for tokens, `expo-linking` for OAuth deep links, and `expo-web-browser` for social sign-in.

This example demonstrates:

- Email + password sign-up and sign-in
- Anonymous guest sign-in and account linking
- OAuth via GitHub, Google, and Discord
- Session listing and revocation

## Setup

1. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_CONVEX_URL` to your Convex deployment URL.
2. Set the required Convex environment variables for the providers you want to use:

```bash
pnpm dlx convex env set EXPO_PUBLIC_CONVEX_URL https://your-deployment.convex.cloud
pnpm dlx convex env set EMAIL_FROM_ADDRESS auth@example.com

# Optional — fill in the providers you want to enable
pnpm dlx convex env set GITHUB_CLIENT_ID your-github-client-id
pnpm dlx convex env set GITHUB_CLIENT_SECRET your-github-client-secret
pnpm dlx convex env set GOOGLE_CLIENT_ID your-google-client-id
pnpm dlx convex env set GOOGLE_CLIENT_SECRET your-google-client-secret
pnpm dlx convex env set DISCORD_CLIENT_ID your-discord-client-id
pnpm dlx convex env set DISCORD_CLIENT_SECRET your-discord-client-secret

# Site URL must match the deep-link scheme configured in app.json, e.g.
pnpm dlx convex env set SITE_URL convex-auth-rn://
```

3. Install dependencies and start:

```bash
pnpm install
pnpm dlx convex dev
# In another terminal
pnpm ios    # or pnpm android, pnpm web
```

For a physical device, scan the QR code from `expo start` with the Expo Go app.
