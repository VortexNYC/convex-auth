---
"@vortex-api/convex-auth": patch
---

fix(nextjs): translate `:name(.*)` legacy wildcards to `{*name}` — `createRouteMatcher` no longer throws on patterns like `/:locale(.*)` under path-to-regexp v8
