# Spec: AdminPortal component (self-service)

## Objective

A `ConvexAdminPortal` component that gives the current user a single place to manage their own account, sessions, and organisations. It is a shell that reuses the existing `convex-auth` React primitives and composes them into a tabbed interface, modelled on Clerk's `UserProfile` and `OrganizationProfile`.

A later slice will add a privileged `ConvexAdminDashboard` component, using the Better Auth `admin` plugin as an API reference, but implemented entirely in the Convex-native runtime.

## Assumptions

1. First slice is **self-service** only: the current user can manage their own data, not other users.
2. Web-first. A React Native variant is a follow-up slice after the web API and design are settled.
3. It uses the existing `convex-auth` React client and components, not a new data layer.
4. Better Auth is a reference, not a runtime dependency. The privileged admin slice will be Convex-native.

## Tech stack

- React + TypeScript
- `convex-auth` React components and hooks (`packages/auth/src/react`)
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
packages/auth/src/react/admin-portal.tsx          # main tabbed shell
packages/auth/src/react/admin-portal.test.tsx     # component tests
packages/auth/src/react/index.ts                  # add export
examples/react/src/admin-portal-page.tsx          # demo page
```

## Code style

- Functional components with explicit prop types.
- `Convex` prefix for public exports, matching `ConvexUserProfile` and `ConvexSessionList`.
- `classNames` and `copy` prop objects for style and text overrides.
- No `any`. Use `unknown` and narrow.
- No `eslint-disable` or `@ts-ignore`.

## Layout (Clerk-inspired)

- Desktop: a left sidebar with tabs and a right content panel.
- Mobile: a top tab bar or a dropdown, same panels.
- Tabs:
  1. **Profile** — `ConvexUserProfile`
  2. **Sessions** — `ConvexSessionList`
  3. **Workspace** — `ConvexOrganizationProfile` + `ConvexOrganizationMembers` (read-only for non-admins)
  4. **Security** — `ConvexEnableTwoFactorForm` and `PasskeyManager` if available

## Testing strategy

- Unit tests for tab switching and copy overrides.
- Snapshot/behaviour tests for loading, empty, and error states.
- Run `pnpm test` in the `auth` package.

## Boundaries

- **Always:** reuse existing components and hooks; no new backend for v0.
- **Ask first:** adding Convex queries/mutations for privileged admin; adding the Better Auth `admin` runtime plugin.
- **Never:** import `better-auth` as a runtime dependency; implement privileged user management in the self-service slice.

## Success criteria

- `ConvexAdminPortal` exported from `@vortex-api/convex-auth/react`.
- Renders the four tabs listed above without duplicating logic from existing components.
- Works in the React example app with no new backend changes.
- Dark mode, responsive, and keyboard navigable.
- `check`, `typecheck`, `build`, and `test` pass.

## Open questions

1. Do we ship the first version with the `Workspace` tab behind a feature flag, or include it always?
2. Should the privileged admin slice be named `ConvexAdminDashboard` or `ConvexAdminPortal`?
