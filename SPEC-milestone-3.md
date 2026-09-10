# Spec: Milestone 3 — Native GitHub OAuth

## Objective

Add a single native OAuth provider (GitHub) to `convex-auth` as a Convex HTTP action and an optional `signIn` action. This proves that social sign-in can live entirely inside the Convex runtime without outsourcing state to Better Auth, and matches the public API shape of `convex-auth` 2.0 (`addHttpRoutes` + `signIn`) and Better Auth (`signIn.social`).

## Design principles

- Mirror Better Auth's provider contract: `createAuthorizationURL`, `validateAuthorizationCode`, `getUserInfo`.
- Mirror Convex Auth 2.0's wiring: `addHttpRoutes(http)` registers `/.well-known/jwks.json`, `/api/auth/signin/:provider`, and `/api/auth/callback/:provider`.
- Reuse existing `convex-auth` tables: `users`, `auth_identities`, `authAccounts`, `authSessions`.
- No schema changes for the first slice. OAuth `state` is a signed short-lived JWT carrying `code_verifier`, `callbackURL`, `errorURL`, and `newUserURL`.
- Callback redirects back to a consumer-configured app URL with the session token in a cookie and/or query param (default: `SITE_URL` / `redirectTo`).

## Assumptions

- One provider only: GitHub.
- GitHub provider metadata (authorization URL, token URL, userinfo URL, scopes, field mapping) is vendored in-repo so the runtime does not depend on `@auth/core`.
- OAuth runtime (PKCE/state generation, token exchange, userinfo fetch, identity provisioning, session creation) is implemented as Convex `action`s and a `httpAction` helper.
- HTTP routes: `/api/auth/signin/github` and `/api/auth/callback/github`.
- Client `signIn` action returns `{ url }` for the client to redirect the browser, matching Better Auth's `signIn.social` and Convex Auth 2.0's `signIn`.
- Feature flag / opt-in is not required for the first slice; the new code is additive.

## Commands

- Build/test: `pnpm run typecheck && pnpm run check && pnpm run build && pnpm test`
- Focused test: `pnpm --filter @vortex-api/convex-auth test -- src/convex-runtime/native/oauth.test.ts`

## Project structure

- New: `packages/auth/src/convex-runtime/native/oauth.ts` — OAuth provider interface + GitHub implementation
- New: `packages/auth/src/convex-runtime/native/oauthState.ts` — PKCE + signed state JWT helpers
- New: `packages/auth/src/convex-runtime/native/oauthHandlers.ts` — shared `signIn`/`callback` handlers
- New: `packages/auth/src/convex-runtime/native/oauthActions.ts` — `signIn` and `callback` Convex actions
- New: `packages/auth/src/convex-runtime/native/oauthHttp.ts` — HTTP router for signin/callback routes
- New: `packages/auth/src/convex-runtime/native/oauth.test.ts` — provider, handler, action, and HTTP tests
- Update: `packages/auth/src/convex-runtime/native/types.ts` — OAuth types
- Update: `packages/auth/src/component/_generated/api.ts` and related generated files if new component functions are added

## Success criteria

1. `GET /api/auth/signin/github` returns a `302` redirect to GitHub authorization URL with `state` and PKCE `code_challenge`.
2. `signIn` action (or HTTP route) accepts `provider`, `callbackURL`, `errorURL`, and `newUserURL` and returns the provider authorization URL.
3. `GET /api/auth/callback/github` receives `code` + `state`, exchanges the code, fetches the GitHub user and primary email, provisions a `users`/`auth_identities`/`authAccounts` row, and creates an `authSessions` row.
4. Callback redirects to `callbackURL` with a signed session token (same shape as the email/password actions).
5. Errors redirect to `errorURL` with `error` and `error_description`.
6. Tests mock GitHub endpoints and prove the full flow, including PKCE, state validation, and new/existing user handling.
7. Full repo proof remains green.

## Open questions

- Should we support `link` (linking an OAuth account to an existing session)? Deferred to a follow-up slice.
- Should we store the provider access token on the account? Deferred; we only use it for the initial userinfo call.
- Vendor the small GitHub provider metadata; no runtime dependency on `@auth/core`.
