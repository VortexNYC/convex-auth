# Agent notes — convex-better-auth-2.0

## Verification commands

Run from the repo root:

```bash
pnpm run check
pnpm run typecheck
pnpm run build
pnpm test
```

## Deployment placeholders

Use generic placeholders in examples and never commit real deployment names:

- Live deployment: `https://<your-deployment>.convex.cloud`
- Dashboard: `https://dashboard.convex.dev/t/<your-team>/<your-project>/<your-deployment>`

## Convex `HttpRouter` route shape

Convex `HttpRouter` only supports exact `path` matches or trailing `pathPrefix` matches. It does **not** support Express-style named parameters. Any route with a dynamic segment must use `pathPrefix` ending in `/` and extract the segment from `new URL(request.url).pathname`.

## Consumer wiring

Canonical consumer entrypoints:

- `convex/convex.config.ts` — `app.use(convexAuth)` so the `convex-auth` component is installed.
- `convex/auth.config.ts` — `export default { providers: [createConvexAuthProvider()] }` so `ctx.auth.getUserIdentity()` works with the native JWTs.
- `convex/auth.ts` — call `convexAuth({ component, emailAndPassword, oauth })`, export the `auth` object and action references.
- `convex/http.ts` — import `auth` from `./auth` and call `auth.addHttpRoutes(http)`.

See `examples/server/convex/` for a working minimal setup.

## Runtime portability

- No `"use node"` directive in deployed source.
- No `node:` imports in the deployed Convex path.
- No `react-dom/server` in deployed source.
- Use Web Crypto (`globalThis.crypto.subtle`, `crypto.getRandomValues`) for hashing and randomness.
- Avoid `atob`/`btoa` in runtime code; use the `bytesToBase64url`/`base64urlToBytes` helpers in `packages/auth/src/convex-runtime/native/password.ts`.

## Branch and PR workflow

Graphite is retired. Entire does not manage branches or PRs. Use the `gh` CLI and the installed `gh stack` extension.

- Track work and sessions with Entire: `entire session`, `entire dispatch`, `entire recap`.
- Start a new stack from `main`: `gh stack init`.
- Add a branch to the current stack: `gh stack add <branch>`.
- Submit the stack as a chain of PRs: `gh stack submit`.
- Sync the stack with remote: `gh stack sync`.
- Merge the whole stack: `gh stack merge`.
- View the stack: `gh stack view`.
