---
title: Releasing
description: "How versions, changelogs, and releases ship: changesets, the release workflow, provenance, and versioned docs."
sidebar:
  order: 16
---

`@vortex-api/convex-auth` releases are driven by changesets and GitHub
Releases. The compatibility contract lives in
[VERSIONING.md](https://github.com/VortexNYC/convex-auth/blob/main/VERSIONING.md);
this page is the operator runbook.

## Normal release flow

1. **Every PR that changes `packages/` source carries a changeset** — enforced
   by the `changeset-gate` CI check. A PR can opt out only with the
   `no-release` label. Major-bump changesets must include a
   `Migration note:` line.
2. **Merge to `main`.** Changesets accumulate.
3. **Run the Release workflow** (`workflow_dispatch`). `changesets/action`
   opens a `chore: version packages` PR that bumps versions, consumes
   pending changesets, and prepends their entries to
   `packages/auth/CHANGELOG.md`. The changelog file is committed and
   load-bearing — `changesets/action` reads it at publish time to build the
   GitHub Release body, and silently skips the release if it is missing.
4. **Merge the version PR, then re-dispatch the workflow.** The publish run
   pushes npm, creates the git tag, and creates the GitHub Release via the
   `GITHUB_TOKEN`. Tags are `@vortex-api/convex-auth@X.Y.Z` (the changesets
   workspace format), immutable, and never moved.
5. **The docs changelog updates itself** — the Blume site sources
   `changelog/*` pages from GitHub Releases, so release notes appear on the
   docs site (with RSS) on the next site build/deploy. No hand-editing.

## Supply chain

- npm publishes run with `NPM_CONFIG_PROVENANCE=true`, producing sigstore
  provenance attestations that link each tarball to this repo's release run.
- GitHub Releases are created by the release workflow via `GITHUB_TOKEN`, so
  tags and release commits are GitHub-verified.

## Major releases

A major additionally requires:

1. A `Migration note:` line in the changeset (gate-enforced).
2. A migration page under `docs/(migrations)/` linked from the
   release notes.
3. After release, freeze the previous major's docs:
   `blume version v<N>` in `site/` — the old line stays reachable while
   `latest` moves forward.
4. If the HTTP contract changed, the `openapi/auth.yaml` diff must already be
   merged — the `OpenAPI contract guard` CI check fails any PR where code
   routes and spec paths diverge.

## What the gates check

| Check                    | Blocks merge when                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `changeset-gate`         | `packages/` source changed without a changeset or `no-release` label; major changeset missing `Migration note:` |
| `OpenAPI contract guard` | A code route is missing from `openapi/auth.yaml`, or the spec documents a route that no longer exists           |
| `checks`                 | Lint/format/typecheck/tests/docs-smoke fail on Node 22 and 24                                                   |
| `prc`                    | Release-blocking production-readiness checks fail                                                               |
