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
