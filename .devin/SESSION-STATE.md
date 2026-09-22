# Session state — 2026-09-22 (release staged)

Repo: `~/Projects/convex-auth` · remote `github.com/VortexNYC/convex-auth` ·
branch `main`, head `bccf2b3` (version 2.5.1), all pushed.

## Where things stand

- **Next.js SSR adapter (#321)** — implemented, live-verified, on PR #343.
  `packages/auth/src/nextjs/` + `examples/nextjs` demo. Live matrix proven:
  SSR render, proxy sign-in/up, session-triple landing, middleware redirects
  (anon + revoked), sign-out, CSRF/CORS. Status comment on #321.
- **Component convergence** — rotation grace window + `convergeSession`,
  bounded family scan (`.take(MAX+1)`, fail-closed), familyId on every mint.
- **#344 fixed** — `b311f3b`: `signOut`/`stopImpersonation` now revoke the
  whole session family via `revokeSessionFamilyBySession`. Legacy rows
  (no familyId) use sessionId as family. Audit: `session.sign_out` for
  voluntary sign-out, `refresh_token_reuse` kept for replay detection.
- **External PR #345 merged** — `8c50b60`: published package now ships the
  full `src/convex-runtime/**` tree; `convex`/`types` conditions point at
  `src/convex-runtime/index.ts`; 3 JSX-free `.tsx`→`.ts` renames; verified
  via `npm pack --dry-run` (234 files, no test leakage).
- **Toolchain reverted to vite-plus 0.2.4** — `a3b00f9` + `d85baa3`.
  The 0.3.x bump + Node-22 floor (`6fe5e1f`, `1235fd6`) were unnecessary:
  0.2.4 ships `vp staged/check/run/pack/test` and `.vite-hooks`. Restored:
  `vite: ^8.2.2`, `advancedChunks`, matrix `[20.x, 22.x]`, engines
  `>=20.12.0`. Upstream issue voidzero-dev/vite-plus#2789 closed.
  `@vitest/coverage-v8` stays pinned at 4.1.11 (matches bundled vitest).
- **Build** — `"use client"`/`"use server"` preserved on chunks via
  `advancedChunks` pin; mixed-directive chunk fails the build.

## Verification

1,571 tests · lint 0/0 · typecheck clean · `vp fmt` clean · `next build`
green with no env vars · live E2E on local deployment.

## Open gates / next

1. **Publish 2.5.1** — one step left: `gh workflow run release.yml --ref main`
   with no pending changesets runs `pnpm ci:publish` → npm + GitHub release.
   Needs `NPM_TOKEN` secret set. Irreversible — confirm before dispatch.
2. **Repo setting worth flipping**: Settings → Actions → "Allow GitHub Actions
   to create and approve pull requests" — the release workflow can't open its
   own version PRs; both were opened manually (#348, #350).
3. **TanStack Start** — unblocked now that #343 merged.
4. Deferred: #337 (post-2.4.0 + TTL window), #334 (next major),
   feature issues #254/#216/#214/#213/#206/#204/#203, docs #218.
   #346 residual: `revokeOtherSessions` exclude is row-level not family-level
   (over-revokes current lineage only — safe); low-level native
   `revokeSession` stays single-row for consumers who want it.

## Restarting the demo

```bash
cd examples/nextjs
pnpm dlx convex dev --dev-deployment local   # backend :3210, site :3211
pnpm dev                                     # Next on :3000 (3100 if taken)
```

JWT keys + `SITE_URL` + `ALLOW_EMAIL_TOKEN_FALLBACK` are already set on the
`anonymous-nextjs` deployment; `convex dev` reuses it.
