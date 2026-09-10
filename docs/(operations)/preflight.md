# Preflight

`convex-auth preflight` checks that a consumer's Convex project is wired up correctly for the native runtime.

## What it checks

- `VITE_CONVEX_URL` or `CONVEX_URL` is set and looks like a Convex URL.
- `CONVEX_SITE_URL` is set and uses the `.convex.site` origin.
- `convex/convex.config.ts` mounts the `convex-auth` component with the expected environment shape (`JWT_PRIVATE_KEY`, `JWKS`).
- `convex/auth.ts` and `convex/http.ts` are present.
- The generated `convex/_generated` files are committed and not stale.

## Run it

```bash
pnpm dlx @vortex-api/convex-auth preflight
```

In a workspace where `convex-auth` is a local dependency:

```bash
pnpm --filter @vortex-api/convex-auth preflight
```

## When to run it

- After a fresh checkout, before the first `convex dev`.
- In CI, to catch missing environment variables or stale generated files.
- After changing `convex/convex.config.ts`, `convex/auth.ts`, or `convex/http.ts`.

## Static / CI usage

`preflight` can run without a live deployment by setting `CONCHECK=1` or passing `--deployment` if you want to validate against a specific project. The consumer contract check in `convex-auth check` is the static counterpart for imports and exports.
