# Migration E2E — live provider environments

Scripts + gated tests for validating real cross-vendor migrations against
live development sandboxes. Wired for **Clerk** and **WorkOS** (see
[issue #415](https://github.com/VortexNYC/convex-auth/issues/415)).

## Environment

| Piece                      | What                                                                                                                                                                                                 | Where it lives                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Clerk development instance | Seeded with the fixture matrix: password users, `external_id` user, username-identifier user, banned user, unverified secondary email, 2 organizations, owner/member memberships, pending invitation | Clerk Dashboard — **dev mode only, never production** |
| `CLERK_SECRET_KEY`         | `sk_test_...` Backend API key                                                                                                                                                                        | `packages/auth/.env.local` (gitignored)               |
| `CONVEX_DEPLOYMENT`        | Scratch deployment used by `examples/server` (`npx convex dev --once`)                                                                                                                               | `examples/server/.env.local`                          |
| API export                 | `tmp/clerk-export/{users,organizations,memberships,invitations}.json`                                                                                                                                | produced by `pull` — gitignored                       |
| Password digests           | `tmp/clerk-export/users.csv` — **manual step**: Clerk Dashboard → instance Settings → User Exports → Export all users → download                                                                     | gitignored                                            |
| WorkOS sandbox             | Same matrix minus banned (no WorkOS banned flag): password users, `external_id` user, unverified user, organization, admin/member memberships, pending invitation                                    | WorkOS Dashboard — **staging/test environment only**  |
| `WORKOS_API_KEY`           | `sk_...` server-side key for the test environment                                                                                                                                                    | `packages/auth/.env.local` (gitignored)               |
| WorkOS export              | `tmp/workos-export/{users,organizations,memberships,invitations}.json`                                                                                                                               | produced by `pull` — gitignored                       |

### WorkOS password digests

WorkOS does **not** expose `password_hash` via the API — a digest export
requires a WorkOS support ticket. Until then `verify` exercises the reset
path, which is what migrated users actually hit: `sendPasswordReset` →
`resetPassword` → `signIn` on a fresh argon2id credential.

## Flow

```bash
# 1. Seed the Clerk dev instance (idempotent — safe to re-run)
pnpm tsx scripts/migration-e2e/clerk.ts seed

# 2. Pull the real API payloads
pnpm tsx scripts/migration-e2e/clerk.ts pull

# 3. Manual: export the dashboard CSV → tmp/clerk-export/users.csv
#    (carries password_digest / password_hasher columns; API output does not)

# 4. Normalize + write into the component via convex-test, and materialize
#    tmp/clerk-export/normalized.json for the deploy step
cd packages/auth && pnpm vitest run src/migrations/clerk-live.test.ts

# 5. Push normalized data into the example app's deployment
cd examples/server && npx convex dev --once && cd ../..
pnpm tsx scripts/migration-e2e/clerk.ts apply

# 6. Prove the live loop: real sign-in → bcrypt verify → lazy argon2id rehash
pnpm tsx scripts/migration-e2e/clerk.ts verify
```

### WorkOS

Same four commands on `workos.ts` (no CSV step — digests are not
self-serve):

```bash
pnpm tsx scripts/migration-e2e/workos.ts seed
pnpm tsx scripts/migration-e2e/workos.ts pull
cd packages/auth && pnpm vitest run src/migrations/workos-live.test.ts && cd ../..
pnpm tsx scripts/migration-e2e/workos.ts apply
pnpm tsx scripts/migration-e2e/workos.ts verify   # reset-path sign-in
```

`verify` asserts: the stored credential starts as the exported `$2a$10$`
digest, `auth:signIn` succeeds with the seeded password, the credential
flips to `$argon2id$` (lazy rehash, CAS-guarded), and a second sign-in
works on the upgraded hash.

## Notes

- Seed data is deterministic and re-runnable — existing users are matched
  by email, orgs by name.
- The CSV is the only manual step; it is also the only artifact containing
  password material. Keep `tmp/` out of commits (already gitignored).
- `convex run --component convexAuth migrate:*` calls the component's
  internal writer mutations directly — admin-level access, so this harness
  only ever runs against scratch/dev deployments.
- CI does not need the export: `clerk-live.test.ts` skips cleanly when
  `tmp/clerk-export/` is absent.
