# Versioning & Compatibility

`@vortex-api/convex-auth` follows [Semantic Versioning](https://semver.org). This
document defines what "public API" means for this package and what each bump
level promises.

## Public API surface

Compatibility promises apply to:

- **Package exports** — every documented export path of
  `@vortex-api/convex-auth` (`/react`, `/convex`, `/nextjs/*`,
  `/tanstack-start/*`, `/server`, etc.) and their exported types.
- **Component functions** — the actions, queries, and mutations re-exported by
  `convexAuth(...)` and reachable through `api.auth.*`.
- **HTTP API** — the routes under `/api/auth/*` described by
  [`openapi/auth.yaml`](./openapi/auth.yaml), including request fields,
  response envelopes, redirect parameters, and cookie names/attributes.
- **Configuration** — `convexAuth(...)` options, `auth.config.ts` wiring, and
  the environment variables documented in the docs (`JWT_PRIVATE_KEY`, `JWKS`,
  `SITE_URL`, `TRUSTED_ORIGINS`, …).

Anything not listed here — internal file layout, undocumented exports, generated
code shape — may change without a major bump.

## Bump rules

- **Patch** — bug fixes, security fixes, and behavior tightening that does not
  change a documented contract. Drop-in replacement; no user action.
- **Minor** — new features, new endpoints, new optional fields/options, new
  provider support, deprecations. Existing documented usage keeps working.
- **Major** — removed or renamed exports/fields/routes, changed request or
  response shapes, newly-required fields, tightened validation that rejects
  previously-accepted input, changed cookie names or semantics, auth-flow
  changes requiring re-integration. Ships with a `Migration note:` in the
  release and a migration page in the docs.

## Breaking vs. non-breaking on the HTTP surface

Following the convention used by mature API providers (Stripe, GitHub), the
following are **not** breaking and may ship in a minor or patch:

- New HTTP routes and new optional request fields.
- New fields in JSON responses — clients must ignore unknown fields.
- New `reason` codes on error paths, unless a docs contract enumerates them
  exhaustively.
- Tightened security defaults that only affect requests that were already
  invalid (e.g. rejecting an untrusted `callbackURL`).

The following **are** breaking:

- Removing or renaming a route, field, enum value, error code, or cookie.
- Changing a field's type or meaning.
- Making an optional field required.
- Narrowing what `trustedOrigins` or redirect validation accepts in a way that
  rejects previously-valid deployments — unless classified as a security fix,
  which ships as a patch with a `Security:` changelog callout and migration
  guidance.

## Deprecation & removal

- Deprecations are announced in the changelog, in docs, and (for the HTTP API)
  via `deprecated: true` in the OpenAPI spec.
- Deprecated surface keeps working for at least one minor release cycle; for
  auth-flow or wire-contract deprecations the target is **90 days minimum**
  before removal.
- Removals ship only in a major release — never in a patch.
- Security-motivated removals may bypass the window; they are labeled
  prominently in release notes with remediation steps.

## Releases

- Git tags are `v<major>.<minor>.<patch>`, immutable, and created by the
  release workflow. Tags are never moved or deleted. npm publishes carry
  [provenance attestations](https://docs.npmjs.com/generating-provenance-statements)
  (sigstore) so consumers can verify a release maps to this repo's CI run.
- The GitHub Release body is the changelog text for that version — one story,
  not two. The docs changelog is generated from GitHub Releases.
- Release notes lead with breaking changes, then added/changed/fixed, then a
  link to the migration page when one exists.
- Every PR that changes `packages/` source carries a changeset (enforced by
  the `changeset-gate` CI check) or the `no-release` label.

## Supported versions

- The latest major line receives all fixes.
- The previous major line receives security fixes for **6 months** after the
  new major ships.
- Older lines are unsupported; migrate using `docs/migrations/` guides.

## Versioned docs

The Blume site renders `latest` unprefixed. When a major ships, the previous
major's docs are frozen with `blume version v<N>` so v1 users keep accurate
docs while v2 moves forward.
