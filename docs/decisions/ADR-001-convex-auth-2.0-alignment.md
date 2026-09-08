---
title: "ADR-001: Native auth `convexAuth` API and schema alignment with Convex Auth 2.0"
description: "Decision record for aligning the API and schema with Convex Auth 2.0."
---

# ADR-001: Native auth `convexAuth` API and schema alignment with Convex Auth 2.0

## Status

Accepted

## Date

2026-09-01

## Context

Issue #70 audited the remaining gaps between the `convex-auth` native runtime and the public API shape of Convex Auth 2.0. The audit surfaced five areas:

1. Schema drift — `auth_identities` vs. `authAccounts` and OAuth-token-heavy account records.
2. Public `convexAuth` seam — missing `isAuthenticated` and `store`.
3. Provider metadata — hand-authored `createGitHubProvider`, `createGoogleProvider`, `createDiscordProvider` instead of `@auth/core/providers/*`.
4. Consumer wiring shape — `convexAuth({ component, emailAndPassword, oauth })` vs. `convexAuth({ providers: [] })`.
5. Magic-link / email-OTP sign-in — now implemented as dedicated native features.

This ADR records which gaps are accepted as deliberate divergence and which have been implemented.

## Decisions

### 1. Schema: keep `auth_identities` and the identity-first data model

**Decision:** Do not rename `auth_identities` to `authAccounts` and do not flatten OAuth accounts into the `providerAccountId`/`secret` shape used by Convex Auth.

`auth_identities` is the canonical table for both password/credential identities and OAuth-linked accounts. It supports the identity-first model used by the native runtime, scoped sessions, organizations, and per-identity OAuth token storage. Flattening to `authAccounts` would force a migration for every existing consumer and would lose the token fields required for refresh flows.

The divergence is documented and the migration guide will explain how to map between the two shapes when moving from Convex Auth.

### 2. Public `convexAuth` seam: `isAuthenticated` and `verifySession` are exposed; `store` is intentionally omitted

**Decision:** `convexAuth` already returns `isAuthenticated` and `verifySession` as part of `NativeAuthQueries`. `store` is not added.

Convex Auth exposes `store` as a single internal mutation that the library client calls to perform sign-in, sign-out, refresh, and verifier operations. The `convex-auth` runtime instead exposes explicit, typed action references (`signIn`, `signUp`, `signOut`, `updateSession`, `sendEmailVerification`, `verifyEmail`, `sendPasswordReset`, `resetPassword`, `verifyPassword`, and the 2FA actions) and a thin HTTP layer that calls those actions directly.

This is a deliberate architectural choice:

- Each action has a clear, typed contract and can be called from the client, from HTTP routes, or from another Convex function without an indirection layer.
- The HTTP routes and the React `ConvexAuthProvider` call the actions directly, so `store` would not be used by the built-in integrations.
- Convex mutations cannot call `ctx.runAction`, so implementing `store` as a mutation would require either turning all public auth functions into mutations or introducing a non-mutation `store` that still diverges from the Convex Auth runtime.

Migration from Convex Auth is handled by mapping the `signIn`/`signUp`/`signOut`/etc. calls to the named action refs returned by `convexAuth`.

### 3. Provider metadata: keep hand-authored providers for now

**Decision:** Continue to ship hand-authored `createGitHubProvider`, `createGoogleProvider`, and `createDiscordProvider` metadata.

The current scope is intentionally limited to three OAuth providers. Hand-authoring keeps the provider module dependency-free and lets us tune the exact field mapping, trusted-origin behavior, and `id_token` verification required by the native runtime. If the provider set expands beyond the core three, or if `@auth/core` is already a dependency for another reason, the provider module will be reconsidered.

### 4. Consumer wiring: keep the component-first config shape

**Decision:** Keep `convexAuth({ component, emailAndPassword, oauth })`.

This shape is a deliberate match for the Convex component model: the consumer registers the `convexAuth` component in `convex.config.ts`, then wires its handle into the auth configuration. It is not a one-to-one config swap with Convex Auth's `convexAuth({ providers: [] })`, and migration guides will map between the two.

### 5. Magic-link / email-OTP: now implemented as dedicated native features

**Decision:** Magic-link and email-OTP sign-in are implemented as native `convex-auth` features, not as alignment changes to Convex Auth 2.0. They reuse the verification-token and email-sender infrastructure.

## Consequences

- Issue #70 can be closed once this ADR lands.
- Migration guides from `@convex-dev/auth` must explicitly describe the schema, `store`, provider, and wiring differences.
- The public `convexAuth` surface is stable: typed action refs plus queries, no `store` indirection.
- Magic-link and email-OTP are now available as native features.

## Related

- Issue #70
- `docs/architecture/convex-native-auth-strategy.md`
- `docs/migration/migrating-from-convex-dev-better-auth.md`
