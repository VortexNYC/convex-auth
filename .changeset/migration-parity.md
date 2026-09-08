---
"convex-auth": patch
"convex-better-auth-adapter": patch
---

Support Better Auth legacy scrypt password hashes and harden the migration bridge.

- `convex-auth` `verifyPassword` now recognizes Better Auth's default `salt:derivedKey` scrypt format, so migrated users can sign in with their existing passwords.
- `convex-better-auth-adapter` migration helpers are now idempotent and return valid JSON from `setMigrationTargets`, fixing dry-run counts and CLI end-to-end runs.
