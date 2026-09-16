---
"@vortex-api/convex-auth": minor
---

Switch password hashing to `argon2id-wasm` (Rust → WASM) — roughly 10x faster inside the Convex isolate than the previous pure-JS `@noble/hashes` path.

- New password hashes are stored in standard PHC format: `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>` (OWASP baseline parameters, unchanged).
- Existing hashes keep verifying: the legacy packed format, Better Auth scrypt, and legacy PBKDF2 all still pass `verifyPassword` — no migration needed.
- WASM init failures now surface as errors instead of reading as "wrong password"; only malformed hashes return `false`.
