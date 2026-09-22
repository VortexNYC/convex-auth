---
"@vortex-api/convex-auth": patch
---

Ship the complete `src/` tree — the published tarball was still missing the component implementation.

- **Fix:** `files` now ships `src/**` wholesale (minus `*.test.*`, `*.vitest.ts`, `*.type-test.ts`), matching the upstream `@convex-dev/auth` source-publish model. Previously only `src/convex-runtime/**` and the nine `convex.config.ts` files shipped, so:
  - `src/convex-runtime/**` imports of `../../component/_generated/*` (server, dataModel, component API) dangled — bundling the `convex` entry failed with `Could not resolve "../../component/_generated/server.js"`.
  - The component itself could not deploy — `defineComponent`'s root is `src/component/` and its `schema.ts`, `_generated/`, and every function module were absent from the tarball.
  - Transitive escapes (`src/compat/permissions`, `src/mcp`, `src/core`) also dangled.
- Verified from the packed tarball: every non-test file under `src/component/` and `src/convex-runtime/` bundles cleanly under esbuild (the same resolver path consumers hit).
