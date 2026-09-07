---
"convex-auth": patch
"convex-better-auth-adapter": patch
---

Implement the `convex-auth migrate better-auth` CLI for one-time migrations off Better Auth.

- `packages/auth/scripts/migrate-better-auth.ts` now uses `migrate:setMigrationTargets` + `migrate:migrateAll` from the vendored adapter for resumable, batched data migration.
- Added `--batch-size`, `--resume`, and `--help` flags.
- Added `getMigrationFunctionHandles` to the `convex-auth` component so the CLI can wire the adapter runner to native migration mutations.
- Added `getLegacyCounts` to the vendored adapter for dry-run reporting.
- Added `rewriteAuthToNative` cutover codemod for `convex/auth.ts` and expanded tests.
