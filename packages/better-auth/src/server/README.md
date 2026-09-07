Better Auth server adapter modules.

Current surfaces:

- Better Auth server wiring
- JWT/JWKS config helpers
- provider registration helpers
- minimal bridge into convex-auth contracts

`createConvexAuthConfig(...)` supports two modes:

- same-origin Better Auth via `CONVEX_SITE_URL` + optional `basePath`
- external Better Auth via explicit `baseURL`, `issuer`, and/or `jwksUrl`

Recommended for external consumers:

- set `BETTER_AUTH_URL` to full Better Auth base path, e.g. `https://auth.example.com/api/auth`
- optionally set `BETTER_AUTH_ISSUER` if token issuer differs from URL origin
- optionally set `BETTER_AUTH_JWKS_URL` if JWKS lives somewhere custom
