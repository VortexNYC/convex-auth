---
"@vortex-api/convex-auth": major
---

Remove deprecated API surfaces ahead of v3. `nativeEmailAndPassword` no longer accepts the top-level `sendVerificationEmailOnSignUp`/`sendVerificationEmailOnSignIn` args — use `email.sendOnSignUp`/`email.sendOnSignIn` instead. The B2B glue's `resolvePermissionOverride` adapter slot is removed — express permission variance as roles; `expandPermissions` is unchanged.

Migration note: move `sendVerificationEmailOnSignUp`/`sendVerificationEmailOnSignIn` under the `email` config object (`sendOnSignUp`/`sendOnSignIn`); if you implemented `resolvePermissionOverride`, model the variance as roles instead — see `docs/(clients-and-migration)/v3-migration.md`.
