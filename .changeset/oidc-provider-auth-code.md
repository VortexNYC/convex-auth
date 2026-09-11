---
"@vortex-api/convex-auth": minor
---

Add OAuth 2.1 / OpenID Connect provider support with authorization-code + PKCE flow.

- `addOidcProviderHttpRoutes` wires `/.well-known/openid-configuration`, `/oauth/authorize`, `/oauth/token`, `/oauth/userinfo`, and `/oauth/jwks`.
- Supports consent redirect, ES256-signed access tokens, refresh tokens, and CORS.
- React demo includes `/oidc-provider-test` and `/oauth/callback` flows.
