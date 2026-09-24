---
"@vortex-api/convex-auth": major
---

Upgrade the Next.js adapter's `path-to-regexp` dependency to v8. The advertised wildcard forms keep matching identically — the adapter translates `X/(.*)` → `X/{*splat}` (slash required, zero-or-more segments) and glued `X(.*)` → `X{*splat}` internally, verified against v6 semantics. Native v8 patterns and `RegExp`/function matchers also work. Patterns outside the advertised contract — unnamed groups like `/(a|b)/` — now throw a descriptive error at `createRouteMatcher` construction.

Migration note: patterns of the form `/(a|b)/` or other unnamed-group syntax must be rewritten as v8 named parameters or `RegExp` instances — see `docs/(clients-and-migration)/v3-migration.md`.
