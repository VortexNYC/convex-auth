# Session state — 2026-09-23 (security fixes on PR #354)

Repo: `~/Projects/convex-auth` · remote `github.com/VortexNYC/convex-auth` ·
branch `feat/tanstack-start-adapter`, head `71b6874`, all pushed.

## Where things stand

- **PR #354** (`feat/tanstack-start-adapter`) — TanStack Start SSR adapter +
  two security fixes. All CI green on `71b6874` (checks 20.x + 22.x, CodeQL,
  deps-and-secrets, sast, secretlint, leaks, prc).
- **Published**: `@vortex-api/convex-auth@2.5.2` is npm `latest`;
  GitHub release `v2.5.2` exists.
- **#356 fixed** — `2259e02`: family revocation now fires only for
  rotated-token replay outside the 15s grace window (`rotatedAt !==
undefined`). Administratively revoked tokens (sign-out,
  `revokeOtherSessions`, admin, passkey removal) reject quietly — no more
  caller-family DoS, no theft-containment loss.
- **#355 fixed** — `71b6874`: session-triple landings are bound to the
  initiating browser via non-HttpOnly `__convexAuthLandingVerifier` cookie
  (`__Host-` prefixed off localhost). Boundary mints on same-origin
  navigations; React client attaches it to OAuth sign-in (signed state)
  and magic-link requests (verifier record); callback/verify routes echo
  it onto the landing URL; boundary compares param-vs-cookie before
  writing auth cookies. Proxies inject the cookie value into `callback`
  args (body-supplied values deleted). Opt-out: `requireLandingVerifier:
false`. Token-mode/native unaffected.
- **Node-20 CI saga resolved** — `91b4d71` + `b4c0081`: `.pnpmfile.cjs`
  `readPackage` hook strips `engines.node` from the 4 TanStack packages
  that poisoned pnpm's installable-graph walk (their `>=22.12` floor
  silently pruned `@rollup/*` optional binaries under Node 20).
- **Cursor pair review** on `2259e02`+`71b6874`: no Critical/High/Medium.
  Four Lows, all inherent or documented (localhost port-fixation,
  first-visit mint race, insecure-context auth already broken,
  `verifyMagicLink` not an enforcement point by design).
- **CodeRabbit**: reviewed `2259e02` — two Minor comment-removal nits
  (declined; comments document security invariants). Incremental review of
  `71b6874` is rate-limited; will land when quota clears.

## Verification

1,666 tests · `pnpm run check` clean · typecheck clean (10 workspaces) ·
`pnpm run build` green.

## Open gates / next

1. CodeRabbit incremental review of `71b6874` (pending rate limit).
2. PR #354 merge decision — green and reviewed per the review-before-merge
   rule once CodeRabbit's pass lands.
3. Deferred feature issues unchanged (#254/#216/#214/#213/#206/#204/#203,
   docs #218). Next.js remains last per the layering plan.
