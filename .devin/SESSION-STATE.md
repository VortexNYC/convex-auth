# Session state — 2026-09-23 (ruthless SSR/auth hardening sweep, PR #354)

Repo: `~/Projects/convex-auth` · remote `github.com/VortexNYC/convex-auth` ·
branch `feat/tanstack-start-adapter`, head `796e3e4`, all pushed.

## Where things stand

- **PR #354** — TanStack Start SSR adapter + security fixes + the full
  ruthless sweep (`b62c80f`, `e84308a`, `796e3e4`).
- **Published**: `@vortex-api/convex-auth@2.5.2` is npm `latest`;
  GitHub release `v2.5.2` exists.
- **#356 fixed** — `2259e02`: family revocation fires only for
  rotated-token replay (`rotatedAt !== undefined`).
- **#355 fixed** — `71b6874`: landing-verifier browser binding.
- **Sweep findings F1-F12** — all fixed, all tested:
  - F1 OAuth `signIn` action redirect allowlist (was unvalidated —
    `?token=&refreshToken=` exfiltration to arbitrary origins).
  - F2 same-origin gate on session-triple landings (compat mode wrote
    auth cookies on credentialed cross-origin fetches).
  - F3 `sec-fetch-site: same-site` no longer skips Origin validation
    (sibling subdomains are cross-origin to the app).
  - F4 relative redirect URLs resolve against SITE_URL/CONVEX_SITE_URL.
  - F5 magic-link `errorCallbackURL`/`newUserCallbackURL` validated +
    `createdUser` honored.
  - F6 Next.js middleware preserves plain-`Response` bodies.
  - F7 token-mode URL ingestion strict-by-default.
  - F8 RN custom-scheme origins (`myapp://`, `exp://**`) — scheme-pattern
    matching, `origin === "null"` aliasing closed.
  - F9 empty `landingVerifier` (`?landingVerifier=` + empty cookie)
    normalized to absent everywhere — `""==""` can't satisfy the check.
  - F10/F11 proxies substitute the cookie value (never body) for
    `landingVerifier` on `signIn` AND `callback`, both `ssr/proxy.ts`
    and `nextjs/server/proxy.ts`; token-mode `oauthCallback` attaches
    the cookie.
  - F12 session-bearing responses emit `Cache-Control: private,
    no-store` (proxy JSON + landing redirects).
- **CodeQL**: 16 `incomplete-hostname-regexp` alerts → `globMatch` is now
  a hand-rolled two-pointer matcher (`796e3e4`) — no RegExp construction,
  no escaping surface. Alerts should clear on re-analysis.
- **Docs**: oauth.md, magic-links.mdx, ssr-contract.md, server-api.mdx
  all corrected to match implementation (no more `updateSession({token})`,
  verifier + trustedOrigins + cache contract documented).

## Reviews

- **Cursor** (`b62c80f`): no Critical/High/Medium. All bypass attempts
  failed. One parity note (nextjs proxy signIn) → fixed `e84308a`.
- **CodeRabbit**: prior findings all resolved (several self-marked
  "Addressed in 3274975/ad2447d"; CSRF/immutable-headers/typed-guard
  Majors fixed by this sweep). Incremental on `e84308a`/`796e3e4`
  in progress via push trigger.

## Verification

1,694 tests · `pnpm run check` clean · typecheck clean (10 workspaces) ·
`pnpm run build` green. CI on `796e3e4` running.

## Open gates / next

1. CodeRabbit incremental + CI green on `796e3e4`.
2. PR #354 merge decision once both gates pass.
3. Deferred feature issues unchanged (#254/#216/#214/#213/#206/#204/#203,
   docs #218). Next.js remains last per the layering plan.
