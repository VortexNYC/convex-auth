# @vortex-api/convex-auth

## 3.0.1

### Patch Changes

- 502bf29: fix(nextjs): translate `:name(.*)` legacy wildcards to `{*name}` — `createRouteMatcher` no longer throws on patterns like `/:locale(.*)` under path-to-regexp v8
