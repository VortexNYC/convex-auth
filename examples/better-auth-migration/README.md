# Better Auth to `convex-auth` migration demo

This example mounts both the legacy `@convex-dev/better-auth` component and the native `convex-auth` component in the same Convex deployment. It exists to exercise the one-time migration CLI and prove data can move from Better Auth tables into native `convex-auth` tables.

## Scope

- Run Better Auth with Convex using the supported plugins (`emailAndPassword`, `oauth`, `twoFactor`, `organization`, `apiKey`, `webhook`).
- Seed representative data for each plugin.
- Run `pnpm dlx @vortex-api/convex-auth migrate better-auth --dry-run`.
- Run the actual migration.
- Verify users, identities, accounts, and sessions in the native tables.
- Run `--cutover` and confirm the app can sign in through the native runtime.

## Setup

```bash
pnpm install
cp .env.example .env.local
# edit .env.local with your Convex deployment and plugin credentials
pnpm dlx convex dev --once
```

## Seed

```bash
pnpm dlx convex run 'seed:all' --push
```

## Migrate

```bash
# preview
pnpm dlx @vortex-api/convex-auth migrate better-auth --dry-run

# migrate data
pnpm dlx @vortex-api/convex-auth migrate better-auth

# migrate + cutover file edits
pnpm dlx @vortex-api/convex-auth migrate better-auth --cutover
```

## Verify

After cutover, `convex/auth.ts` uses `convexAuth({ component: components.convexAuth, ... })` and the legacy component is gone. The app should sign in with the native client using the same data.
