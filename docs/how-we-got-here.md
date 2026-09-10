# How we got here

This is the short history of `convex-auth`: why we started on Better Auth rails, why that stopped being enough, and how Convex Auth 2.0 gave us the signal to build a native Convex auth runtime.

## Level 1 — Better Auth as the pragmatic first rail

When we started, Convex did not have a first-party auth product that covered the full Clerk/WorkOS surface: email/password, OAuth, 2FA, organizations, API keys, service sessions, webhooks, and MCP auth. Better Auth did. It was the best available auth framework for the feature set we needed.

So we built `convex-auth` as a **Better Auth integration for Convex**. The idea was to let Better Auth own the auth primitives and wire them into Convex's database and component model.

### What worked

- Better Auth gave us battle-tested password hashing, session issuance, OAuth, 2FA, and email flows on day one.
- The community `@convex-dev/better-auth` adapter showed that Better Auth could run inside the Convex isolate.
- We could ship a working auth stack for Convex apps before Convex Auth existed.

### What broke down

Better Auth is designed for a long-lived Node.js/Edge runtime. Convex functions are stateless V8 isolates. The mismatch showed up quickly:

- **Bundle size.** Better Auth's barrel imports and plugin instantiation pushed the `convex/` bundle toward the 32 MiB source-code limit. Consumers had to use subpath imports and lazy route registration to stay under it.
- **Memory.** Better Auth keeps plugin state and crypto in memory. Convex functions have a 64 MB heap and cannot afford that.
- **Determinism.** Better Auth's middleware and session machine assume a request/response lifecycle. Convex queries and mutations must be deterministic and fast.
- **Lock-in.** Better Auth wants to own the tables for organizations, members, invitations, API keys, and webhooks. If those became the source of truth, we would inherit Better Auth's data model and future migrations would be painful.
- **Performance.** The adapter sometimes showed slow queries on empty tables, missing session indexes, and async JWT claim handling that did not fit the Convex query model.

The conclusion was clear: Better Auth was a great starting point, but its plugin model and runtime assumptions could not be the long-term foundation for a Convex-native auth platform. We needed to keep the auth **state** in Convex tables and rebuild the B2B control plane as Convex components, even if Better Auth still handled the low-level authentication primitives for a while.

## Level 2 — Convex Auth 2.0 showed the way

Convex Auth 2.0 was announced with a clear architectural direction:

- Auth runs in the same database and runtime as the app.
- Auth state is just Convex state: users, sessions, and identities are tables.
- Non-deterministic work (password hashing, network calls, token generation) belongs in actions.
- Crypto uses Web Crypto, not Node crypto.
- Providers are metadata, not a runtime framework.
- The public API is a single `convexAuth({ providers })` helper that returns typed action refs.

This was the signal we were waiting for. It validated that the native path was viable and gave us the design vocabulary for the next phase: moving authentication itself into Convex, not just the B2B control plane.

### What we did next

We used Convex Auth 2.0's architecture as a reference, not as a dependency. We rebuilt `convex-auth` as an independent, native Convex auth runtime:

- Email/password sign-up, sign-in, password reset, and email verification inside Convex actions.
- OAuth for Google, GitHub, and Discord as Convex HTTP actions with vendored provider metadata.
- JWT/JWKS minting and verification with `crypto.subtle` and `jose`.
- Session and refresh token tables in the `convexAuth` component.
- TOTP, backup codes, email OTP, and magic links using Web Crypto and Convex tables.
- Organizations, members, invitations, roles, permissions, API keys, webhooks, MCP, and agent auth already lived in the `convexAuth` component from the earlier work.

`convex-auth` no longer imports or depends on `better-auth` at runtime.

## Where we are now

- `convex-auth` is the native Convex auth runtime. New projects should start here.
- `convex-better-auth-adapter` and `convex-better-auth` exist only as a one-time migration bridge for existing Better Auth consumers.
- The bridge copies users, accounts, and sessions once, then the consumer removes Better Auth and the bridge packages.
- The B2B control plane (orgs, members, invitations, permissions, API keys, webhooks, MCP, agent auth) is already Convex-native.

Better Auth was the right first rail. Convex Auth 2.0 showed us the second rail. `convex-auth` is the result: a Convex-native auth platform that keeps the feature surface and gets the architecture right.
