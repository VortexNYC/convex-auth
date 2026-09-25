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

## Post-merge debt sweep (2026-09-24, continued)

- **PR #377 merged** (`6ca561e`) — docs drift audit: Next.js + TanStack
  Start adapter guides, server-api.mdx action corrections, link fixes.
  Cursor review caught 6 signature inaccuracies in server-api.mdx
  (pre-existing drift) — all verified against validators and fixed.
- **PR #378 merged** (`a56d3a1`) — apiKeys feature-gate twin drift:
  `issueApiKey`/`issueServiceOwnedApiKey` in `component/apiKeys/` lacked
  `allowedIpRanges` that the monolith had. Fixed + synced missing JSDoc.
  Twins now differ only by import paths.
- **New test**: `featureGatedParity.test.ts` pins all five component
  twins (apiKeys/servicePrincipals/webhooks/authMd/agentAuth) to the
  monolith after import normalization — drift now fails CI.
- **Filed #379** — dormant `*.vitest.ts` conformance suite: 10 files,
  5 pass (48 tests dark), 5 broken (stale `@convexnyc/auth/test` import,
  stale module path, wasm env). Needs wire-in-or-delete decision.
- Twin-duplication note: nested `component/<name>/` dirs are feature-gated
  sub-components; flat `component/<name>.ts` files are the monolith's
  functions. `organizations/organizations.ts` is a pure re-export shim.
- Board: 16 open issues — all either time-gated debt (#337/#373/#374,
  #379 needs triage), v3 gate (#334, staged as #375), draft
  (#372 ~Oct 18), or features/adapters deferred by user (#203-206,
  #213-214, #216, #254, #367-370, #371).

## Release pipeline repair + 3.0.1 (2026-09-25)

- **@vortex-api/convex-auth@3.0.1 published** — routeMatcher `:name(.*)`
  wildcard fix; first release through the repaired pipeline.
- **Root causes found + fixed**:
  - `changesets/action` v1.9.0 parsed stdout for `New tag:` lines that CLI
    v3 never emits → tags/releases skipped. Upgraded to v2.1.2 (pinned to
    commit `ae32849d`, NOT the tag-object SHA — `uses:` needs the commit).
  - v2 `createRelease` reads `<pkg>/CHANGELOG.md` for the release body and
    silently skips on ENOENT — `.gitignore` excluded it. Un-ignored +
    seeded (PR #397). Changelog is now committed and load-bearing.
- **Verified live**: action pushed tag `@vortex-api/convex-auth@3.0.1`
  itself; release created manually this once; next publish should be
  fully automatic (watch the next version PR for a CHANGELOG.md diff).
- **Docs deployed** to resilient-mule-559.convex.site: v2 frozen tree at
  /v2/\*, changelog pages incl. 3.0.1 generated from GitHub Releases.
- `blume version` quirk: needs `content.root: "../docs"` in
  site/blume.config.ts to snapshot into the real docs dir.
- npm registry propagation lag is real (~12min); don't trust a 404 on a
  versioned endpoint immediately after publish.

## Debt cleanup + toolchain wave (2026-09-25)

- **PR #399** — dead `expo-linking` dep removed from react-native-web
  (#388 closed). Keep `optimizeDeps.exclude` + the optional peer in the
  package; the example-local `.npmrc` (auto-install-peers=false) can
  stamp the workspace lockfile if pnpm runs inside that dir — always
  regen the lockfile from repo root.
- **PR #400** — toolchain wave landed (#387): vite-plus 1.0.0-rc.0 at
  root; `vite` resolves via `npm:@voidzero-dev/vite-plus-core` (has NO
  bin — example scripts migrated `vite`→`vp dev|build|preview`);
  vitest pinned 5.0.1 matching the bundled runner; coverage aligned.
  Rolldown is stricter than rollup — expo-* externalized in the RN-web
  example. Root engines now `^22.18 || ^24.11 || >=26` (vite-plus
  floor); the 20.x CI leg stays for published-runtime proof (vitest 5
  verified green under node 20.20).
- **PR #401** — blume 2.0.2: adapter-model config (sources/reference
  factories), `content.root` removed — `blume version` snapshots at the
  first filesystem() source root, so docs/v2 freeze is preserved.
  deployment.site fixed to resilient-mule-559. 2.0 validator surfaced
  30 pre-existing dead /docs/* hrefs — fixed (live `/X`, frozen
  `/v2/X`). Adopted: changelog nav tab + agents.llmsTxt.details.
- **PR #402** — CI gap closed: `sitechanged` scope runs `blume
validate` + `blume build` on 22.x for site/docs diffs; GITHUB_TOKEN
  set so the github-releases source can't fail-open to an empty
  changelog under rate-limit.
- Branch-hopping hazard: node_modules follows the last install's
  branch — a stale vp 0.2.4 produced wrong formatter output that
  rc.0 CI rejected. After switching branches, run `pnpm install`
  before trusting `vp check`.

## Hono adapter (PR #405, 2026-09-25)

- `src/ssr/state.ts` moved up from `tanstack-start/server` — it was
  already framework-agnostic (WeakMap keyed on Request). Old path
  re-exports; zero consumer API change. All adapters now share the
  request-scoped session oracle.
- Hono trap (Cursor catch): `c.res = x` is a SETTER that merges the
  old response's headers over the assigned one — Set-Cookie appended
  pre-assignment gets deleted, Cache-Control reverts. Correct order:
  assign the rebuilt Response FIRST, then `headers.append` on
  `c.res.headers`. Regression test uses method-shadowed Headers
  (`headers.append = () => { throw }`) to simulate immutable
  redirect/fetch responses — `new Response` headers are mutable, so
  shadowing is the only way to force the rebuild path.
- Rotation/CORS bookkeeping keys on the Request OBJECT identity —
  middleware that swaps `c.req.raw` downstream detaches the helpers.
- Adapter test pattern: real `new Hono()` + `app.request()`, no
  mocked framework seams. 22 tests cover proxy intercept vs competing
  route, immutable-response rebuild, streaming body, HEAD rotation.

## Docs site: header links, favicon, stale-view gotcha (2026-09-25)

- **Docs deploy path**: `pnpm -F site run deploy` wraps `convex deploy`
  and prompts interactively — fails in non-interactive shells. For
  docs-only pushes use `pnpm dlx @convex-dev/static-hosting deploy
--skip-convex --skip-build` from `site/` (build first with
  `pnpm -F site run build`). Backend functions unchanged → static
  upload only.
- **Blume auto-detects favicons** in `site/public/`: `favicon.svg`,
  `favicon.png`, `favicon.ico`, `icon.svg`, `icon-dark.png`,
  `apple-touch-icon.png`. With none present it serves a bundled
  default (the "random logo" users saw). Ours: `favicon.svg` +
  `favicon.png` + `apple-touch-icon.png`, white tile + black mark so
  it reads in light and dark browser chrome.
- **Header links**: `github: { owner, repo, dir: "docs" }` in
  blume.config.ts gives the repo icon button AND "Edit this page";
  `navigation.actions` = plain header links; `navigation.featured` =
  pinned links above sidebar groups.
- **Duplicate brand row**: a page titled the same as `title` in
  blume.config renders a second "Convex Auth" row at the top of the
  sidebar. Index page is titled "Introduction" to avoid it.
- **Stale-view gotcha**: static-hosting serves HTML with
  `max-age=0, must-revalidate` but Safari still shows the old page
  from an open tab — verify deploys by curling the HTML, not just
  eyeballing a tab that was already open.
- **Client contract gotcha** (Cursor, PR #407): `signIn.social()`
  returns `{ data: { url } }` and does NOT navigate — callers must
  assign `window.location.href`. `signIn.email()` resolving with
  `error: null` is NOT "signed in" — 2FA-enrolled accounts get
  `{ data: { twoFactorRedirect: true } }` without a session. Samples
  must match `examples/nextjs/app/sign-in/page.tsx`.

## labs.vortex.nyc/convex-auth — domain model (2026-09-25)

- Docs canonical URL is now `https://labs.vortex.nyc/convex-auth`.
  `labs.vortex.nyc` is Vortex-owned — this repo may serve content ONLY
  under the `/convex-auth` path prefix; other labs repos get their own
  `labs.vortex.nyc/<repo>` prefixes. Do not touch anything outside the
  prefix.
- Implementation: `deployment: { site: "https://labs.vortex.nyc",
base: "/convex-auth" }` in site/blume.config.ts prefixes every
  internal link/asset/canonical; `site/convex/http.ts` strips the
  prefix before resolving stored assets (files upload to dist root;
  asset storage paths stay root-relative). Requests outside the
  prefix 302 into it — old resilient-mule-559.convex.site deep links
  keep working.
- Routing requirement for Vortex infra: `labs.vortex.nyc/convex-auth/*`
  must reach `resilient-mule-559.convex.site/convex-auth/*` with the
  path PRESERVED (no rewrite needed). Any proxy that forwards the path
  as-is works. A Convex custom-domain map of labs.vortex.nyc → this
  deployment would also work but locks the whole domain to one
  deployment — incompatible with the multi-repo labs model.
