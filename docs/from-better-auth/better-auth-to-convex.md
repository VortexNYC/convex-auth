---
title: Better Auth to `convex-auth` mapping
description: "Map Better Auth concepts and behavior to convex-auth."
---

# Better Auth to `convex-auth` mapping

This document maps Better Auth concepts to the native `convex-auth` runtime. It is useful if you are migrating from Better Auth or comparing the two systems.

## What changed

`convex-auth` is now a fully native Convex auth runtime. It does not import or depend on `better-auth` at runtime. The `convex-better-auth-adapter` and `convex-better-auth` packages are used only for the one-time data and client migration.

## Mapping Better Auth plugins to `convex-auth`

| Better Auth plugin | `convex-auth` replacement                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| `organization`     | `packages/auth/src/component/organizations.ts` — orgs, members, invitations                       |
| `admin`            | `packages/auth/src/component/scopes.ts` and `servicePrincipals.ts` — roles and permissions        |
| `api-key`          | `packages/auth/src/component/apiKeys.ts` — API key issuance, rotation, and verification           |
| `two-factor`       | `packages/auth/src/component/identity.ts` — TOTP and backup codes                                 |
| `oauth-provider`   | `packages/auth/src/mcp.ts` and `agent-auth-protocol/` — MCP and agent auth flows                  |
| `webhooks`         | `packages/auth/src/component/webhooks.ts` — webhook fan-out and security                          |
| Authentication     | `convex-auth` native email/password, OAuth, session minting, JWT/JWKS, and password reset actions |

The data that used to live in Better Auth's adapter tables is now stored directly in the `convexAuth` component tables (`users`, `auth_identities`, `authAccounts`, `authSessions`, etc.).

## Migration terminology

| Better Auth term | `convex-auth` term                 | Notes                                                                                              |
| ---------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `user`           | `users`                            | Stored in the `convexAuth` component.                                                              |
| `account`        | `authAccounts` + `auth_identities` | Password and OAuth accounts are both identities.                                                   |
| `session`        | `authSessions`                     | Native JWT sessions, not Better Auth opaque sessions.                                              |
| `organization`   | `organizations` / `members`        | Convex-native B2B control plane.                                                                   |
| `apiKey`         | `authApiKeys`                      | API keys and service sessions.                                                                     |
| `twoFactor`      | `auth_identities.totp`             | TOTP secret and backup codes per identity.                                                         |
| `jwt`            | `JWT_PRIVATE_KEY` / `JWKS` env     | Convex signs and verifies tokens with `crypto.subtle` and `jose`.                                  |
| `oauth`          | Provider metadata + HTTP actions   | Google, GitHub, and Discord are built in; provider metadata is pure data, not a runtime framework. |

## What happens to the bridge packages after migration

Once the one-time migration finishes and the consumer cuts over to the native runtime, `convex-better-auth` and `convex-better-auth-adapter` are removed from `package.json`. They should not be used for new features or kept as a runtime dependency.
