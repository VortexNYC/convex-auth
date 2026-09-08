---
title: Better Auth to `convex-auth` mapping
description: "Map Better Auth concepts, plugins, and frameworks to convex-auth."
---

# Better Auth to `convex-auth` mapping

This document maps Better Auth concepts to the native `convex-auth` runtime. It is useful if you are migrating from Better Auth or comparing the two systems.

## What changed

`convex-auth` is now a fully native Convex auth runtime. It does not import or depend on `better-auth` at runtime. The `convex-better-auth-adapter` and `convex-better-auth` packages are used only for the one-time data and client migration.

## Framework guide parity

| `@convex-dev/better-auth` guide | `convex-auth` status                                             |
| ------------------------------- | ---------------------------------------------------------------- |
| React (Vite SPA)                | [`convex-auth-react`](../frameworks/client)                      |
| Expo (React Native)             | [`convex-auth-react-native`](../frameworks/react-native)         |
| TanStack Start                  | Not yet supported. Use `convex-auth-react` in non-SSR mode.      |
| Next.js                         | Not yet supported. Use `convex-auth-react` in client components. |
| SvelteKit                       | Not yet supported.                                               |

## Better Auth plugin parity

| Better Auth plugin | `convex-auth` replacement                                                                                                         | Status        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `organization`     | `convex-auth` organizations component (`organizations`, `organization_members`, `organization_invitations`, `organization_roles`) | Supported     |
| `admin`            | `convex-auth` scopes + service principals + RBAC helpers                                                                          | Supported     |
| `api-key`          | `convex-auth` API keys component (`api_keys`, `service_principals`)                                                               | Supported     |
| `two-factor`       | `convex-auth` TOTP + backup codes in `auth_identities`                                                                            | Supported     |
| `oauth`            | Built-in Google, GitHub, Discord providers + HTTP actions                                                                         | Supported     |
| `webhooks`         | `convex-auth` webhooks component (`webhook_endpoints`, `webhook_deliveries`)                                                      | Supported     |
| `email-otp`        | Native email OTP actions (`sendVerificationOtp`, `verifyEmailOtp`)                                                                | Supported     |
| `magic-link`       | Native magic-link HTTP routes and actions                                                                                         | Supported     |
| `anonymous`        | No direct replacement. Use `convexAuth` session actions + a guest-identity pattern.                                               | Not supported |
| `generic-oauth`    | Built-in providers or custom OAuth metadata. No generic `oauth2` plugin.                                                          | Partial       |
| `jwt`              | Convex native JWT sessions + JWKS endpoint                                                                                        | Equivalent    |
| `one-tap`          | Not implemented.                                                                                                                  | Not supported |
| `phone-number`     | Not implemented. Use `convex-auth` OTP with a custom `PhoneOtpSender` as a stopgap.                                               | Not supported |
| `username`         | Not implemented.                                                                                                                  | Not supported |
| `sso`              | Not supported by `convex-auth`. SSO via OIDC/SAML is out of scope.                                                                | Not supported |

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

## Common client-side rewrites

### Sign in

```tsx
// Better Auth
await authClient.signIn.email({ email, password });

// convex-auth
import { useAuthActions } from "convex-auth/react";
const { signIn } = useAuthActions();
await signIn.email({ email, password });
```

### OAuth

```tsx
// Better Auth
await authClient.signIn.social({ provider: "google", callbackURL: "/" });

// convex-auth
const { signInWithRedirect } = useAuthActions();
await signInWithRedirect({ provider: "google", callbackURL: window.location.href });
```

### Get current user

```tsx
// Better Auth
import { useSession } from "better-auth/react";
const { data: session } = useSession();

// convex-auth
import { useUser } from "convex-auth/react";
const user = useUser();
```

## What happens to the bridge packages after migration

Once the one-time migration finishes and the consumer cuts over to the native runtime, `better-auth`, `@convex-dev/better-auth`, `convex-better-auth`, and `convex-better-auth-adapter` are removed from `package.json`. They should not be used for new features or kept as a runtime dependency.
