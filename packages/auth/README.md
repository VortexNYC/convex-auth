# convex-auth

Convex-native authentication component, control plane, and server integration.

This is the main package most apps install. It runs users, sessions, identities, email/password, OAuth (Google/GitHub/Discord), TOTP 2FA, email verification, password reset, API keys, organizations, webhooks, and MCP auth inside your Convex backend — no separate auth server required.

> **Disclaimer:** This is an independent, community-driven project. It is not affiliated with or endorsed by Convex Inc.

## Install

```bash
pnpm add @vortex-api/convex-auth
```

## Quick start

1. Generate an RS256 key pair and set the `JWT_PRIVATE_KEY` and `JWKS` environment variables on your Convex deployment.
2. Create `convex/auth.config.ts`.
3. Mount the component in `convex/convex.config.ts`.
4. Configure `convex/auth.ts`.
5. Wire `convex/http.ts`.
6. Wrap your React app with `ConvexAuthClientProvider` from `convex-auth/react`.

See the root [README](../README.md) for the complete quick start, JWT generation snippet, and examples.

## License

Apache-2.0
