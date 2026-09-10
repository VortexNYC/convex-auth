---
"convex-auth": patch
---

Derive a stable `kid` (JWK SHA-256 thumbprint) for JWT signing and JWKS publication when the configured keys do not already include one. This ensures Convex's native `customJwt` provider can match the token header to the public key, fixing deployments where `ctx.auth.getUserIdentity()` was returning null despite a cryptographically valid token.
