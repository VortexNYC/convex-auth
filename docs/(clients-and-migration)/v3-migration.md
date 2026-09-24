# Migrating to v3

Working draft of the breaking changes queued for the next major release. Each
entry links the tracking issue and the required consumer action. This page
ships with the v3 release; until then it documents the `next-major` backlog.

## `OidcProviderStorageAdapter.getSessionByToken` must return `expiresAt` (#334)

`getSessionByToken` previously accepted `{ userId, revokedAt?, expiresAt? }`.
In v3 `expiresAt` is **required**: an adapter that returns only `{ userId }` no
longer type-checks, instead of silently skipping session expiry at runtime.

**Action for custom storage adapters:** return the session's expiry timestamp
in milliseconds:

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

`revokedAt` remains optional and honored whenever present. The built-in
component-backed adapter always populates `expiresAt`, so consumers using the
default storage need no changes.

## Upgrade path: deploy the latest 2.x first

v3 removes three legacy-compatibility fallbacks in the session layer:

- **Legacy passkey sessions** are no longer auto-revoked by
  `revokePasskeySessions` (#337).
- **`identityId` is no longer read from JWT claims** during session refresh —
  only the session row's column is honored (#373).
- **Sessions without a `familyId`** are no longer matched by
  `revokeSessionFamily` (#374).

The 2.x line backfills `familyId`/`identityId` on existing sessions via
`migrateSession`. **If you are running a version older than 2.5.x, deploy the
latest 2.x release first** and let it run long enough for active sessions to
rotate through refresh — sessions that never migrate lose family-revocation
coverage (e.g. "sign out other sessions") after upgrading to v3. Fresh sign-ins
are unaffected.

## Deprecated provider args removed

`nativeEmailAndPassword` no longer accepts the top-level
`sendVerificationEmailOnSignUp` / `sendVerificationEmailOnSignIn` args. Move
them under `email`:

```ts
nativeEmailAndPassword(component, {
  email: {
    sendEmail,
    sendOnSignUp: true, // was sendVerificationEmailOnSignUp
    sendOnSignIn: false, // was sendVerificationEmailOnSignIn
    // ...
  },
});
```

## `resolvePermissionOverride` adapter removed

The B2B glue's `resolvePermissionOverride` slot is deleted. The canonical
model is **roles carry permissions, members carry roles** — per-member
overrides stored authorization state outside the component.

**Action if you implemented it:** express each override variance as a role
(e.g. a `member+export` role) and assign it, or move the field into the
component. `expandPermissions` is unchanged and remains the hook for
wildcard/inheritance expansion.

## `path-to-regexp` upgraded to v8 (Next.js adapter)

The adapter's runtime dependency moved from v6 to v8. Your existing patterns
still work — the adapter translates the legacy wildcard forms internally:

- `/api/(.*)` and `/api/*` → v8 `{*splat}` (zero-or-more segments, identical
  match semantics)
- Native v8 syntax (`/api{*splat}`, `/api/*rest`) is also accepted
- `RegExp` instances and predicate functions are untouched

Only patterns that were never part of the advertised contract — unnamed
groups like `/(a|b)/` — now throw at construction with a descriptive error.
