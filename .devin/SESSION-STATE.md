# Session state — 2026-09-23 (SSR sweep + demo hardening + release hygiene, PR #354)

Repo: `~/Projects/convex-auth` · remote `github.com/VortexNYC/convex-auth` ·
branch `feat/tanstack-start-adapter`, head `8bab3b9`, all pushed.

## Where things stand

- **PR #354** — TanStack Start SSR adapter + security fixes + the full
  ruthless sweep + demo-environment hardening.
- **Published**: `@vortex-api/convex-auth@2.5.2` is npm `latest`;
  GitHub release `v2.5.2` exists.
- **Sweep F1–F12 fixed and tested** (see git log `b62c80f`–`3600b5c`).

## Demo environments — deployed and smoke-tested live

Cloud:

- `perfect-dragon-698` — react example SPA + backend (dev).
- `cheerful-buzzard-770` — oauth example SPA + backend (prod slot; moved
  off `perfect-dragon-698` — the two were clobbering each other).
- `stoic-pony-614` — react-native backend (dev).
- `fast-gopher-450` — server example backend (dev).

Local anonymous backends (unique ports so all coexist):

- nextjs `3210/3211` · tanstack-start `3212/3213` · tanstack-router
  `3214/3215` · react-native-web `3216/3217` · better-auth-migration
  `3218/3219`. Ports live in each example's gitignored `.env.local`;
  `docs/(reference)/examples.md` documents the convention.

Verified live: untrusted `callbackURL` → `invalid_callback_url`; trusted
origin → signed provider URL; `convex-auth-rn://` + `exp://` accepted on
the RN deployment and rejected elsewhere; magic-link verify rejects evil
redirects (400); sign-up → sign-in → refresh rotation roundtrip 200;
rotated-token replay inside 15s grace converges, after grace →
`invalid_refresh_token`; `convex logs` clean on all deployments.

## New findings fixed since the sweep

- `11ba8cd` — `/api/auth/update-session` now runs `checkCsrf` (it wrote
  session cookies from a body-supplied refreshToken with no CSRF check —
  session-fixation vector). Live-verified 403 on all four cloud
  deployments + regression test.
- `2bbae9a` — CodeRabbit incremental Majors, both real:
  - Split-base open redirect: `isAllowedRedirectUrl` validated against
    request origin/`CONVEX_SITE_URL` while `resolveRedirectUrl` resolved
    against `SITE_URL` first — `https:evil.example.com` validated as a
    same-origin path under https but resolved absolute under http →
    `?token=` exfiltration. All validators + resolvers now share
    `redirectBaseOrigin()` (`SITE_URL ?? CONVEX_SITE_URL ?? requestOrigin`).
  - TanStack middleware appended auth cookies to downstream responses
    without forcing `Cache-Control` — `applyCookies` now pins
    `private, no-store`.

## Release/changelog/docs hygiene (new)

- `site/blume.config.ts` — `github-releases` content source wired
  (`prefix: changelog`, `VortexNYC/convex-auth`): every GitHub release
  auto-builds a `/changelog` timeline entry + `changelog/rss.xml`.
  Verified in `pnpm run build` output.
- `changeset-gate` workflow + `scripts/changeset-gate.sh` (adapted from
  vortex-core): package source changes require a changeset or the
  `no-release` label; major bumps require a `Migration note:` line.
  Label `no-release` created.
- Release titles normalized to `convex-auth vX.Y.Z` (was mixed:
  `v2.0.5 — desc`, `convex-auth@1.7.5`, `v0.1.0-alpha.0`).
- `blume-update-docs` skill vendored to `.devin/skills/` — the docs-drift
  audit Hayden ships with Blume (audits merged PRs vs docs, fixes stale
  pages, opens a maintenance PR).

## Reviews

- Cursor (`b62c80f`): clean. CodeRabbit incremental completed at ~17:36 —
  both Majors fixed in `2bbae9a`; remaining Minors: test `as any` casts,
  comment-style nits, silent-rejection UX note on `ConvexAuthProvider`.

## Verification

223 native tests · `vp check` clean · typecheck clean · `pnpm run build`
green (includes site/changelog). CI pending on `8bab3b9`.

## Open gates / next

1. CI + CodeRabbit incremental on `2bbae9a`/`8bab3b9`.
2. CodeRabbit Minors: `as any` in `magicLink.test.ts:286`, comment nits,
   silent landing-rejection UX in `ConvexAuthProvider.tsx:601`.
3. `deployment.site` in `site/blume.config.ts` is a placeholder — set the
   real docs origin so the changelog RSS feed gets absolute URLs.
4. Optional: schedule the vendored `blume-update-docs` audit (Devin
   scheduled session) for recurring docs freshness.
5. PR #354 merge decision once reviews settle.
