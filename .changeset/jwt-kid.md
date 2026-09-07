---
"convex-auth": patch
---

Include `kid` in signed JWT headers and generate matching `kid` values in the README key-generation snippet so Convex can validate session tokens against the configured JWKS.
