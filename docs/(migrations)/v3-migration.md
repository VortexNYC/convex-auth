# Migrating to v3

`@vortex-api/convex-auth` v3 removes deprecated API surfaces, drops
legacy session-compatibility fallbacks, and tightens the SSR landing
flow. Most consumers upgrade with no code changes — use this page to
find the entries that apply to you.

## Do I need to do anything?

| Change                                   | You are affected if…                                                                       | Effort                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Landing verifier binding                 | Users open magic-link/OAuth emails in a different browser or in-app webview                | Set `requireLandingVerifier: false`, or surface `?error=landing_verifier_mismatch` |
| `getSessionByToken` requires `expiresAt` | You wrote a custom `OidcProviderStorageAdapter`                                            | Return `expiresAt` (ms) — required field                                           |
| Session fallback removals                | You are upgrading from **< 2.5.x** with live sessions                                      | Deploy latest 2.x first so sessions backfill                                       |
| Provider args removed                    | You pass `sendVerificationEmailOnSignUp`/`OnSignIn` at top level                           | Move them under `email`                                                            |
| `resolvePermissionOverride` removed      | You implemented the B2B override adapter                                                   | Model the variance as roles                                                        |
| Stricter redirect validation             | You pass `callbackURL`/`errorURL`/`newUserURL` to `signIn` pointing at non-trusted origins | Add them to `trustedOrigins`                                                       |
| `path-to-regexp` v8                      | Your `createRouteMatcher` patterns use unnamed groups like `/(a\|b)/`                      | Rewrite as `/:key` or `RegExp`                                                     |

If none of the "you are affected" rows apply, v3 is a drop-in upgrade.

---

## Session landings are bound to the initiating browser (#355)

**What changed.** Session-triple landings (`?token=&refreshToken=&sessionId=`
in the URL) now require the `__convexAuthLandingVerifier` cookie that was
minted in the browser that _started_ the flow. A landing opened in a
different browser — e.g. a magic link the user reads on their phone, or
inside a mail client's in-app webview — no longer writes auth cookies.
The redirect still completes, but with the session params stripped and
`?error=landing_verifier_mismatch` appended.

**Why.** Anyone holding the landing URL could land the session — a login
CSRF where an attacker finishes their own OAuth flow and feeds the victim
the resulting landing URL.

**What to do.** Nothing if your flows start and finish in the same
browser — the verifier is threaded automatically (OAuth via signed state,
magic links via the verifier record). If your product _expects_
cross-browser completion (common for magic links):

```ts
// convex/auth boundary or middleware config
requireLandingVerifier: false;
```

…or keep the check on and render a real error page when the landing URL
carries `?error=landing_verifier_mismatch` — the recommended option.
React Native / non-DOM clients never bind; token-mode web clients bind
client-side (`requireLandingVerifier={false}` opts out there too).

## `OidcProviderStorageAdapter.getSessionByToken` must return `expiresAt` (#334)

**What changed.** `getSessionByToken` previously accepted
`{ userId, revokedAt?, expiresAt? }`. In v3 `expiresAt` is **required**:
an adapter returning only `{ userId }` no longer type-checks instead of
silently skipping session expiry at runtime.

**What to do.** Custom storage adapters return the session's expiry
timestamp in milliseconds:

```ts
getSessionByToken: async (token) => {
  const session = await lookupSession(token);
  if (!session) return null;
  return {
    userId: session.userId,
    expiresAt: session.expiresAtMs, // now required
    revokedAt: session.revokedAtMs, // still optional — omit when not revoked
  };
};
```

The built-in component-backed adapter always populates `expiresAt`;
consumers on the default storage need no changes.

## Upgrade path: deploy the latest 2.x first

v3 removes three legacy-compatibility fallbacks in the session layer:

- **Legacy passkey sessions** are no longer auto-revoked by
  `revokePasskeySessions` (#337 — sessions minted before v2.4.0 lacked
  `credentialId`).
- **`identityId` is no longer read from JWT claims** during session
  refresh — only the session row's column is honored (#373 — column
  added in v2.5.1).
- **Sessions without a `familyId`** are no longer matched by
  `revokeSessionFamily` (#374 — threading added in v2.4.1).

These removals are safe _because_ the 2.x line backfills the fields:
`migrateSession` stamps `familyId`/`identityId` on any session that
rotates through refresh, and the 30-day refresh TTL means unmigrated
rows expire on their own.

**If you are running a version older than 2.5.x, deploy the latest 2.x
release first** and let it run long enough for active sessions to
refresh once (a few hours covers any active user). Sessions that never
migrate lose family-revocation coverage — e.g. "sign out other
sessions" — after upgrading to v3. Fresh sign-ins are unaffected.

## Deprecated provider args removed

**What changed.** `nativeEmailAndPassword` no longer accepts the
top-level `sendVerificationEmailOnSignUp` /
`sendVerificationEmailOnSignIn` args (deprecated since 2.x).

**What to do.** Move them under `email`:

```ts
nativeEmailAndPassword(component, {
  email: {
    sendEmail,
    sendOnSignUp: true, // was sendVerificationEmailOnSignUp
    sendOnSignIn: false, // was sendVerificationEmailOnSignIn
  },
});
```

## `resolvePermissionOverride` adapter removed

**What changed.** The B2B glue's `resolvePermissionOverride` slot is
deleted. Per-member overrides stored authorization state outside the
component's source of truth — the canonical model is **roles carry
permissions, members carry roles**.

**What to do.** If you implemented it: express each override variance as
a role (e.g. a `member+export` role) and assign it, or move the field
into the component. `expandPermissions` is unchanged and remains the
hook for wildcard/inheritance expansion.

## Stricter redirect & callback validation

**What changed.** The OAuth `signIn` _action_ now validates
`callbackURL`/`errorURL`/`newUserURL` against the same merged allowlist
the HTTP routes always used (`SITE_URL`, `CONVEX_SITE_URL`,
`trustedOrigins`, OIDC login origin). Previously only the routes
validated; the public action accepted arbitrary origins — an OAuth URL
could exfiltrate `?token=` to an attacker origin.

Also tightened: protocol-relative URLs (`//evil.com`) resolve before
comparison; `Sec-Fetch-Site: same-site` no longer skips origin
validation; relative redirect URLs resolve against `SITE_URL` (not
`http://localhost`); magic-link `errorCallbackURL`/`newUserCallbackURL`
are validated; custom schemes (`myapp://`, `exp://`) work only via
explicit `trustedOrigins` patterns.

**What to do.** If any flow passes callback/redirect URLs to origins
outside your site — custom-scheme deep links, a marketing domain, a
staging origin — add them to `emailAndPassword.trustedOrigins` /
`oauth.trustedOrigins`. Everything else is unchanged.

## `path-to-regexp` v8 (Next.js adapter)

The adapter's runtime dependency moved v6 → v8. Your existing patterns
still work — the adapter translates the legacy wildcard forms
internally:

- `/api/(.*)` → `/api/{*splat}` (slash required, zero-or-more segments —
  identical to v6, verified pattern-by-pattern)
- Glued `/dashboard(.*)` → `/dashboard{*splat}` (matches `/dashboardfoo`,
  as v6 did)
- Native v8 syntax (`/api/{*splat}`, `/api/*rest`) is also accepted
- `RegExp` instances and predicate functions are untouched

Patterns outside the advertised contract now throw a descriptive error at
`createRouteMatcher` construction — unnamed groups like `/(a|b)/`, and
bare `*` wildcards (which threw in v6 as well). Rewrite those as v8 named
parameters (`/:key`) or pass `RegExp` instances.

## Everything else in 3.0.0

No action required — listed for completeness:

- **Session security fixes** — `revokeOtherSessions` now spares the
  caller's whole session family, and family revocation only fires on
  _rotated_-token replay (administrative revocation replays get a quiet
  rejection instead of nuking the family).
- **Index cleanup** — 8 covered prefix indexes dropped; applies on your
  next `convex dev`/`push`. Creation-ordered list endpoints keep their
  dedicated indexes.
- **API keys** — `allowedIpRanges` now accepted on `issueApiKey` /
  `issueServiceOwnedApiKey` in the feature-gated component (parity with
  the monolith).
- **New entries** — `@vortex-api/convex-auth/tanstack-start` adapter and
  `@vortex-api/convex-auth/test` (`register`, `convexAuthTest`,
  `modules`, `schema` for `convex-test` harnesses).
- **`ConvexAuthClient` type** — the alias remains but is deprecated;
  use `ConvexBetterAuthClient`.
