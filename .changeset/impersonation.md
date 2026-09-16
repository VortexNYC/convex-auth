---
"@vortex-api/convex-auth": minor
---

Add safe admin impersonation for the privileged admin dashboard. Super admins can start a short-lived, audited session for a target user, view an active impersonation banner in the React example, and stop the session to restore their original credentials.

Expand the privileged admin user API to match the Better Auth admin surface: `createUser`, `setRole`, `setUserPassword`, and `listUsers` now support search, filtering, sorting, and pagination. `impersonationSessionDuration` is configurable through the `IMPERSONATION_SESSION_DURATION_MS` component environment variable.
