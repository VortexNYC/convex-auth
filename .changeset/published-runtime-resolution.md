---
"@vortex-api/convex-auth": patch
---

Fix published package missing most of `src/convex-runtime`.

- **Fix:** the `files` allowlist shipped only a handful of `convex-runtime` modules while `native/index.ts` imports across the whole tree (`oauth-provider`, `providers`, `webhooks`, …), so installing the package from npm failed to resolve `./convexAuth.js`, `./authProvider.js`, `./provider.js`, and friends. The package now ships the full `src/convex-runtime/**` tree (tests and type tests excluded).
- The `convex` and `types` export conditions now point at `src/convex-runtime/index.ts` so consumers can reach the organizations, webhooks, and agent-auth surfaces too.
- Three JSX-free `.tsx` files were renamed to `.ts`, and `.toSorted()` calls were replaced with `.sort()` on fresh arrays for wider runtime compatibility.

Thanks [@david-potgieter](https://github.com/david-potgieter) for the report and fix (#345).
