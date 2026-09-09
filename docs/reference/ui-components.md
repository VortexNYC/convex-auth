# UI components

The `convex-auth` React package ships presentation components for the most common auth and B2B surfaces. They are intentionally unstyled at the core and use `classNames` and Tailwind-friendly tokens so they compose into a consumer's design system.

All components are exported from `convex-auth/react`.

```ts
import {
  ConvexAuthAppearanceProvider,
  useConvexAuthAppearance,
  ConvexAuthSignInButton,
  ConvexAuthSignUpButton,
  ConvexAuthSignOutButton,
  ConvexOrganizationSwitcher,
} from "convex-auth/react";
```

## Theming

Wrap your app with `ConvexAuthAppearanceProvider` to manage light/dark/system theming.

```tsx
<ConvexAuthAppearanceProvider defaultTheme="system">{children}</ConvexAuthAppearanceProvider>
```

`useConvexAuthAppearance` returns the current `theme` (`"light" | "dark" | "system"`) and the resolved `resolvedTheme` (`"light" | "dark"`). The provider sets `data-convex-auth-theme` on the document root and persists the user's choice in `localStorage`.

## Auth trigger components

Use the trigger components to add sign-in, sign-up, and sign-out buttons anywhere in your app. They default to primary variants and accept custom children.

```tsx
<ConvexAuthSignInButton redirectToSignIn={redirectToSignIn}>
  Sign in
</ConvexAuthSignInButton>

<ConvexAuthSignUpButton redirectToSignUp={redirectToSignUp}>
  Sign up
</ConvexAuthSignUpButton>

<ConvexAuthSignOutButton signOut={signOut}>
  Sign out
</ConvexAuthSignOutButton>
```

Each button accepts `variant?: "primary" | "secondary"` and the action props are injected by the auth runtime in `convex-auth-app-runtime`.

## Organization switcher

`ConvexOrganizationSwitcher` renders a workspace switcher with optional search and in-place workspace creation.

```tsx
<ConvexOrganizationSwitcher
  organizations={organizations}
  currentOrganizationId={currentOrganizationId}
  onSelectOrganization={setCurrentOrganization}
  onSelectPersonalAccount={goToPersonal}
  enableSearch
  onInPlaceCreateOrganization={async (name) => createOrganization(name)}
/>
```

- `enableSearch` filters the "Other workspaces" list by name or slug.
- `onInPlaceCreateOrganization` opens a name-input form inline in the dropdown.
- `onCreateOrganization` continues to work as a no-arg callback for opening an external create flow.

## classNames convention

Most components accept a `classNames` object that maps to sub-element keys. Use `classNames` to override the Tailwind defaults or integrate with shadcn-style design tokens. For example:

```tsx
<ConvexOrganizationSwitcher
  classNames={{
    trigger: "h-9 px-3",
    dropdown: "w-72",
    searchInput: "rounded-md",
    inPlaceCreateButton: "bg-primary",
  }}
/>
```

See the component source files in `packages/react/src` for the full `classNames` and `copy` key lists for each component.
