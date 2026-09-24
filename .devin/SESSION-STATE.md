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

## Review-sweep pass (2026-09-23, post-012e872)

- `.coderabbit.yaml` path rule sweep: removed ~500 standalone `//`
  comments and trailing comments from branch-touched `packages/**` files
  ("No comments unless asked"); restored doc-example lines and the
  Next.js #56632 workaround reference eaten by the sweep.
- `as any` → typed access in `magicLink.test.ts` (Mockify handle) and
  `queries.test.ts` (`r as (typeof routes)[number]`).
- Rejected landings are no longer silent: boundary, Next.js request
  handler, and token-mode provider write `?error=landing_verifier_mismatch`
  (or `?error=cross_origin`) onto the stripped redirect/cleanup URL.
  Documented in `ssr-contract.md`; tests assert the param.
- #356 closed: `revokeSessionsForUser` gains `excludeFamilyId`
  (`familyId ?? sessionId` semantics); `revokeOtherSessions` passes the
  caller's family. Regression test added; generated `component.ts`
  surfaces updated.
- #333: upstream filed at get-convex/convex-backend#567
  (`stringifyValueForError` crashes on function-valued args).
- #337: stays until ~2026-10-18 (30d post-2.4.1 refresh TTL).
- #334: staged for v3 major with migration-note plan.
- TanStack findings confirmed already-fixed (immutable-header rebuild,
  typed-guard null throw).

## Debt pass (2026-09-23, post-1f3841a)

- Issue hygiene: classification labels applied across tracker
  (`security`/`bug`/`upstream`/`debt`/`next-major`/`adapter`/`follow-up`);
  #371 pinned as canonical roadmap. Closed with evidence: #218 (UI docs +
  migration-equivalents table), #324 (Expo ~57.0.24, bridgeless noise
  upstream), #333 (upstream filed). #353 auto-closes via `Closes #353` on
  PR #354. Verified open-but-real: #254 (no public shareable links yet),
  #203/#204/#206/#216 features, #334 (v3 gate), #337 (~Oct 18 gate).
- Test-file `as any` sweep: all non-generated casts removed
  (identity.test.ts ids already `GenericId`-typed from `db.insert`;
  emailOtp/magicLink `(component as any)` redundant on `Mockify` mocks).
- Flagged comments in untouched files folded into JSDoc
  (`mcp.ts` export-surface contract, `component/mcp.ts` validator +
  signing-key invariants, `migrate.ts` 2FA note, `nextjs` #56632
  workaround on `getCookieStore`).
- Proxy twin collapse: `runAuthProxy` core in `ssr/proxy.ts`
  (`AuthProxyIO` seam: readCookies/jsonResponse/writeCookies/callAction/
  log); `nextjs/server/proxy.ts` shrank 236→66 lines binding
  `getRequestCookies`/`setAuthCookies`/`fetchAction`. Folded in a real
  drift fix: the Next twin never validated `cookieConfig.maxAge <= 0`.
  `parseAuthCookies` now returns `landingVerifier` too (additive).
  `shouldProxyAuthAction` delegates. Boundary twin
  (`boundary.ts` vs `request.ts`) still duplicated — deeper divergence,
  separate extraction.
- Verify: check/typecheck clean; 1697/1697 tests pass.

## Boundary twin collapse (2026-09-23, 7f706ec)

- `runAuthBoundary` core in `ssr/boundary.ts` — one copy of the
  landing/CORS/error-param/refresh decision tree; `AuthBoundaryIO` seam:
  readCookies/readLandingVerifier/stripForwardedAuthCookies/redirect/
  writeCookies/writeLandingVerifier/callAction/log.
- `nextjs/server/request.ts` 158→67 lines. Two-jar split preserved:
  refresh reads `cookies()` store, verifier reads middleware-bound
  `request.cookies` (they are genuinely different jars in Next — tests
  encode it).
- `nextjs/server/utils.ts` + `cookies.ts` deduped onto ssr versions:
  isCorsRequest, decodeTokenClaims, logVerbose ("ConvexAuthNextjs" tag),
  AuthCookieValues, five cookie-name constants.
- Cursor review: no issues — verified decision-tree/effect parity
  exhaustively (incl. pre-existing 307-vs-302 redirect-code split and
  conditional strippedCookieHeader). CI + CodeRabbit green.
- Remaining twin debt: none in SSR surface. `ssr/` is now the single
  source for proxy + boundary decision logic; future adapters bind io.

## Comment sweep + merge state (2026-09-24)

- **#354 merged** into main as `4393a6f` (squash); #353 auto-closed.
- **PR #376** `chore/comment-sweep` — all line comments swept from
  `packages/` sources per repo rule. Semantics folded into declaration
  JSDoc; positional/section notes use block comments (which cannot
  misattach as JSDoc); pragmas (`///`, `@ts-expect-error`,
  `@vitest-environment`, `nosemgrep`) kept as line comments — they're
  directives.
- **TanStack example typecheck fix**: `types: ["vite/client", "node"]` —
  the exclusive list had blocked root `@types/node` auto-inclusion, so
  `process.env` in `convex/` + pulled-in auth src was untyped. Siblings
  auto-include; parity restored.
- **Sweep hazards found and fixed**: `/**` inside `import.meta.glob`
  strings and `exp://**` origin patterns got eaten by mechanical
  downgrade passes; JSDoc examples' comment content got converted; all
  restored. Rule for future mechanical passes: never match `/**` inside
  quoted strings.
- **#372** draft (legacy passkey-session drop, gates ~Oct 18 2026);
  **#375** draft (OIDC expiresAt required, `next-major` v3 gate);
  follow-ups filed: #373 identityId-JWT fallback, #374 familyId-less
  session lookup.
- Issue board: 15 open, all real work or explicit gates. Labels added:
  security/bug/upstream/debt/next-major/adapter/follow-up; #371 pinned
  roadmap with build order.

## Docs drift audit (2026-09-24) — PR #377 `blume/docs-refresh-2026-09-24`

- **#376 merged** into main as `d4829d8` (squash). Local `git checkout main`
  still blocked by stale CI worktree `/private/tmp/ci-main-node20` — work
  from `origin/main` / new branches instead.
- Audit found: no user-facing setup docs for either shipped SSR adapter,
  and `server-api.mdx` was missing 4 actions + had drifted signatures.
- Added `nextjs.mdx` + `tanstack-start.mdx` under clients-and-migration
  (wiring mirrored verbatim from examples), added both to meta.ts.
- `server-api.mdx`: added `updateUser`, `listSessions`, `revokeSession`,
  `revokeOtherSessions`; corrected `signUp` (name required), `signOut`
  (token required), OAuth `callback` (not `oauthCallback`, state
  required), 2FA verify returns (full session), `twoFactorGenerateBackupCodes`
  (password required); removed `changeEmail` row — no such action exists
  (email change = `sendVerificationOtp({ type: "change-email" })`).
- Fixed pre-existing broken links: oauth.md ssr-contract ref (angle-bracket
  form never resolved), quickstart `./examples/server` → `./examples#server-with-hono`.
- Fixed wrong claims: oauth.md localhost callback fallback (actually
  `AUTH_REDIRECT_URL ?? CONVEX_SITE_URL`, throws if unset);
  requireLandingVerifier in cookie mode lives on middleware, not provider;
  quickstart provider-wrapping wording.
- `excludeFamilyId` deliberately not documented — internal component arg.
- Verified: `blume build` clean, `blume validate` 0 broken links (was 6),
  `pnpm run check` clean, `docs:smoke` passed. Cursor review pass applied.
