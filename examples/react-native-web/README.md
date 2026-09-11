# `examples/react-native-web`

A React Native **web** example that builds and runs in the browser via `react-native-web` and Vite. The same `src/App.tsx` code can be adapted for an Expo or React Native CLI project, but this workspace is browser-only and uses `localStorage` and `window.location.origin`.

This example demonstrates:

- Email + password sign-up and sign-in
- Anonymous guest sign-in and account linking
- OAuth via GitHub, Google, and Discord
- Password reset, email verification, and TOTP

## Setup

1. Copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_CONVEX_URL` to your Convex deployment URL.
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
```

3. Run:

```bash
pnpm install
pnpm dev
```

For a native iOS/Android build, create an Expo project with `pnpm create expo`, add `@vortex-api/convex-auth/react-native`, and adapt `src/App.tsx` to use `expo-secure-store`, `expo-linking`, and `expo-web-browser` instead of `localStorage` and `window`.
