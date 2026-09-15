# Spec: ConvexAdminDashboard (privileged admin)

## Capability map

| Module | Responsibility | Depends on |
|---|---|---|
| admin-core | RBAC gate, viewer resolution, audit context | auth core, permissions engine |
| users-admin | List, create, update, ban/unban, delete users | admin-core |
| sessions-admin | List and revoke any user session, revoke all sessions for a user | admin-core, users-admin |
| organisations-admin | List orgs, manage members and role templates | admin-core, users-admin |
| audit-log | Read-only admin action log | admin-core, all admin modules |

Build order: `admin-core` → `users-admin` / `sessions-admin` / `organisations-admin` (parallel) → `audit-log`

## Objective

A `ConvexAdminDashboard` component that lets an authorised administrator manage the whole application: all users, all sessions, all organisations, and all role assignments. It is a privileged, read/write administrative surface modelled on Clerk’s admin-facing concepts and Better Auth’s `admin` plugin API, but implemented entirely in the Convex-native runtime.

`ConvexAdminDashboard` is a separate component from `ConvexAdminPortal`. The portal is self-service; the dashboard is for administrators.

## Assumptions

1. The dashboard is **Convex-native**. Better Auth’s `admin` plugin is API/UX reference, not a runtime dependency.
2. Authorisation uses the existing `convex-auth` permission engine and organisation role templates (`admin-core`).
3. First slice is web-first. React Native follows once the web API and design are stable.
4. The consuming app defines who is an administrator (app-level super-admin or org-scoped owner) outside this component.
5. Audit logging is read-only in v0; writing audit records is built into each admin mutation.

## Tech stack

- React + TypeScript
- `convex-auth` component APIs, queries, mutations, actions (`packages/auth/src/convex-runtime`, `packages/auth/src/component`)
- `convex-auth` React hooks and providers (`packages/auth/src/react`)
- Tailwind / shadcn design tokens already used in the repo
- Vitest + React Testing Library for component tests

## Commands

```bash
pnpm run check
pnpm run typecheck
pnpm run build
pnpm test
```

## Project structure

```
packages/auth/src/convex-runtime/admin/        # native admin queries/mutations/actions
packages/auth/src/react/admin-dashboard.tsx    # main dashboard shell
packages/auth/src/react/admin-dashboard.test.ts
packages/auth/src/react/index.ts               # add export
examples/react/src/AdminDashboardPanel.tsx     # demo page
```

## Code style

- Functional components with explicit prop types.
- `Convex` prefix for public exports (`ConvexAdminDashboard`).
- `classNames` and `copy` prop objects for style and text overrides.
- No `any`. Use `unknown` and narrow.
- No `eslint-disable` or `@ts-ignore`.
- Convex queries use indexed filters, never `filter()` on auth tables.

## Layout

- A left sidebar lists admin sections.
- The right content panel renders the selected section.
- Sections for v0:
  1. **Users** — paginated list, search, detail card, role selector, ban/unban toggle.
  2. **Sessions** — list active sessions across all users, revoke one or all for a user.
  3. **Organisations** — list orgs, view members, add/remove members, change role templates.
  4. **Audit log** — read-only, time-ordered admin actions.

## Testing strategy

- Unit tests for the dashboard shell and tab navigation.
- Hook tests for `useConvexAdminUsers`, `useConvexAdminSessions`, `useConvexAdminOrganisations`.
- Convex test coverage for the native admin queries/mutations where authorisation is the concern.
- Run `pnpm test` in the `auth` package.

## Boundaries

- **Always:** implement admin operations as Convex-native queries/mutations; reuse the permission engine and role templates; keep public APIs typed; write tests for new functionality.
- **Ask first:** adding new database tables or indexes; adding app-level super-admin roles; adding impersonation; adding user hard-delete; changing CI.
- **Never:** import `better-auth` as a runtime dependency; expose admin operations without authorisation checks; mix self-service and privileged admin logic in one component.

## Success criteria

- `ConvexAdminDashboard` exported from `@vortex-api/convex-auth/react`.
- Renders Users, Sessions, Organisations, and Audit sections without duplicating logic from the self-service portal.
- All data operations go through Convex-native, authorised queries/mutations.
- Works in the React example app with a demo admin page.
- Dark mode, responsive, and keyboard navigable.
- `check`, `typecheck`, `build`, and `test` pass.

## Open questions

1. Is the first version app-scoped (super-admin) or org-scoped (org owner/admin), or both?
2. Should user impersonation be in v0 or a follow-up slice?
3. Should user deletion be hard delete or a banned/suspended flag in v0?
