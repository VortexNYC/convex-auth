---
"@vortex-api/convex-auth": minor
---

feat: Clerk/WorkOS migration foundation — `verifyPassword` now accepts imported bcrypt digests (`$2a$`/`$2b$`/`$2y$` via hash-wasm, isolate-safe) and any verified non-native or below-floor credential lazily rehashes to argon2id with a CAS guard; new `src/migrations/` normalizers (Clerk API+CSV, WorkOS) plus idempotent internal `migrateOrganization`/`migrateMembership` writers with role seeding, invited→active promotion, and migration-marker attach guards
