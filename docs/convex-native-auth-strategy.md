---
title: Convex-native auth strategy
description: "The recommended native Convex auth runtime and roadmap."
---

# Convex-native auth strategy

`convex-auth` is a Convex-native auth runtime. It stores users, sessions, identities, and the B2B control plane in your Convex database and runs in the default Convex isolate. Better Auth is no longer used at runtime; it is supported only as a one-time migration source.

## Why native Convex auth

Convex functions run in a V8 isolate, not a long-lived Node process. Auth must fit that model:

- Auth state should live in Convex tables so queries, mutations, and authorization rules can read it directly.
- Non-deterministic work (password hashing, network calls, token generation) belongs in Convex actions.
- Crypto uses Web Crypto (`crypto.subtle`) and `jose`, not Node crypto modules.
- The bundle must stay under the 32 MiB source-code and 64 MB heap limits.

A Node/Edge auth framework like Better Auth fights these constraints. The `convex-auth` runtime was built from scratch to match them.

## What `convex-auth` implements today

- Email/password sign-up, sign-in, and sign-out.
- Email verification and password reset flows.
- JWT/JWKS minting and verification with `crypto.subtle` and `jose`.
- Sessions and refresh tokens stored in Convex tables.
- OAuth for Google, GitHub, and Discord.
- TOTP 2FA and backup codes.
- Organizations, members, invitations, roles, and permissions.
- API keys and service sessions.
- Webhook fan-out and security.
- MCP and agent-auth protocols.

## Relationship to Convex Auth 2.0

`convex-auth` is an independent implementation. It learns from Convex Auth 2.0's design constraints but ships its own B2B surface. We are not copying Convex Auth 2.0, and we do not depend on it. The table layout and public API are intentionally close so migration is straightforward when Convex Auth 2.0 is ready.

## The one-time migration bridge

If you are already using Better Auth, `convex-better-auth-adapter` and `convex-better-auth` provide a one-time data and client migration. The steps are:

1. Mount the legacy `betterAuth` adapter component alongside the native `convexAuth` component.
2. Run `pnpm dlx convex-auth migrate better-auth` to copy users, accounts, and sessions.
3. Cut over `convex/convex.config.ts` and `convex/http.ts` to native `convex-auth`.
4. Swap the React client to `convex-auth/react`.
5. Remove `convex-better-auth` and `convex-better-auth-adapter` from `package.json`.

See [`migrating-from-better-auth.md`](./migrating-from-better-auth.md) for the full migration guide.
