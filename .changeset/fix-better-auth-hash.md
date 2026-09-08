---
"convex-auth": patch
"convex-better-auth-adapter": patch
---

Fix Better Auth password hash verification and 2FA migration.

- `convex-auth` now verifies Better Auth 1.7 scrypt hashes using the hex salt string and NFKC-normalized passwords, matching the upstream implementation.
- `convex-auth` no longer copies `twoFactorEnabled` from legacy users, since TOTP secrets are not migrated.
