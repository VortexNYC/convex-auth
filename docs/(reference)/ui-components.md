---
title: UI components
description: Complete reference for every React component exported by @vortex-api/convex-auth/react.
sidebar:
  order: 7
---

The `@vortex-api/convex-auth/react` package ships uncontrolled React components for auth, organizations, profile management, security, webhooks, and theming. Most components accept `classNames` and `copy` objects so you can override styling and text without ejecting from the component.

```ts
import { ConvexAuthProvider, ConvexAuthAppearanceProvider } from "@vortex-api/convex-auth/react";
```

## Theming

Wrap your app with `ConvexAuthAppearanceProvider` to manage light/dark/system theming. `useConvexAuthAppearance` returns the current `theme`, resolved `resolvedTheme`, and `setTheme`. The provider sets `data-convex-auth-theme` on the document root and persists the user's choice in `localStorage`.

```tsx
<ConvexAuthAppearanceProvider defaultTheme="system" storageKey="convex-auth-theme">
  {children}
</ConvexAuthAppearanceProvider>
```

## Component reference

The tables below list every exported component, its props, and the `classNames` / `copy` keys it supports. Optional props are marked `Yes`. Type names are shortened for readability; see the TypeScript declarations in `packages/auth/dist/react.d.ts` for exact types.

## API keys

### `ConvexApiKeyCreateForm`

**Generics:** `<Scope>`

**Props**

| Name                    | Type                                      | Optional | Description |
| ----------------------- | ----------------------------------------- | -------- | ----------- |
| `apiEnabled`            | `boolean`                                 | No       |             |
| `classNames`            | `ConvexApiKeyClassNames`                  | Yes      |             |
| `copy`                  | `ConvexApiKeyCreateFormCopy`              | Yes      |             |
| `creating`              | `boolean`                                 | No       |             |
| `expirationOptions`     | `readonly ConvexApiKeyExpirationOption[]` | Yes      |             |
| `onExpiresInDaysChange` | `(value: string) => void`                 | No       |             |
| `onIpAllowlistChange`   | `(value: string) => void`                 | No       |             |
| `onNameChange`          | `(value: string) => void`                 | No       |             |
| `onScopesChange`        | `(value: Scope[]) => void`                | No       |             |
| `onSubmit`              | `() => void`                              | No       |             |
| `scopeOptions`          | `readonly Scope[]`                        | No       |             |
| `state`                 | `ConvexApiKeyCreateFormState<Scope>`      | No       |             |

**classNames keys**

| Key                     | Type     | Description |
| ----------------------- | -------- | ----------- |
| `actions`               | `string` |             |
| `createCard`            | `string` |             |
| `createContent`         | `string` |             |
| `input`                 | `string` |             |
| `keyDetails`            | `string` |             |
| `keyName`               | `string` |             |
| `keyPrefix`             | `string` |             |
| `keyStatus`             | `string` |             |
| `label`                 | `string` |             |
| `labelText`             | `string` |             |
| `list`                  | `string` |             |
| `listCard`              | `string` |             |
| `listContent`           | `string` |             |
| `listHeader`            | `string` |             |
| `metadata`              | `string` |             |
| `primaryButton`         | `string` |             |
| `primaryButtonDisabled` | `string` |             |
| `scopeButton`           | `string` |             |
| `scopeButtonDisabled`   | `string` |             |
| `scopeButtonSelected`   | `string` |             |
| `scopeList`             | `string` |             |
| `secondaryButton`       | `string` |             |
| `select`                | `string` |             |
| `stateText`             | `string` |             |
| `tag`                   | `string` |             |
| `tags`                  | `string` |             |
| `textarea`              | `string` |             |

**copy keys**

| Key                      | Type     | Description |
| ------------------------ | -------- | ----------- |
| `createLabel`            | `string` |             |
| `creatingLabel`          | `string` |             |
| `expirationLabel`        | `string` |             |
| `ipAllowlistLabel`       | `string` |             |
| `ipAllowlistPlaceholder` | `string` |             |
| `nameLabel`              | `string` |             |
| `namePlaceholder`        | `string` |             |

### `ConvexApiKeyList`

**Generics:** `<Scope, ApiKeyId>`

**Props**

| Name              | Type                                                            | Optional | Description |
| ----------------- | --------------------------------------------------------------- | -------- | ----------- |
| `apiKeys`         | `readonly ConvexApiKeyListItem<Scope, ApiKeyId>[] \| undefined` | No       |             |
| `classNames`      | `ConvexApiKeyClassNames`                                        | Yes      |             |
| `copy`            | `ConvexApiKeyListCopy`                                          | No       |             |
| `formatTimestamp` | `(timestamp: number) => string`                                 | Yes      |             |
| `onRevoke`        | `(apiKeyId: ApiKeyId) => void`                                  | No       |             |
| `onRotate`        | `(apiKeyId: ApiKeyId) => void`                                  | No       |             |
| `renderTag`       | `(label: string) => ReactNode`                                  | Yes      |             |

**classNames keys**

| Key                     | Type     | Description |
| ----------------------- | -------- | ----------- |
| `actions`               | `string` |             |
| `createCard`            | `string` |             |
| `createContent`         | `string` |             |
| `input`                 | `string` |             |
| `keyDetails`            | `string` |             |
| `keyName`               | `string` |             |
| `keyPrefix`             | `string` |             |
| `keyStatus`             | `string` |             |
| `label`                 | `string` |             |
| `labelText`             | `string` |             |
| `list`                  | `string` |             |
| `listCard`              | `string` |             |
| `listContent`           | `string` |             |
| `listHeader`            | `string` |             |
| `metadata`              | `string` |             |
| `primaryButton`         | `string` |             |
| `primaryButtonDisabled` | `string` |             |
| `scopeButton`           | `string` |             |
| `scopeButtonDisabled`   | `string` |             |
| `scopeButtonSelected`   | `string` |             |
| `scopeList`             | `string` |             |
| `secondaryButton`       | `string` |             |
| `select`                | `string` |             |
| `stateText`             | `string` |             |
| `tag`                   | `string` |             |
| `tags`                  | `string` |             |
| `textarea`              | `string` |             |

**copy keys**

| Key                   | Type     | Description |
| --------------------- | -------- | ----------- |
| `createdByLabel`      | `string` |             |
| `emptyMessage`        | `string` |             |
| `expiresLabel`        | `string` |             |
| `lastUsedLabel`       | `string` |             |
| `loadingMessage`      | `string` |             |
| `neverLabel`          | `string` |             |
| `revokeLabel`         | `string` |             |
| `rotateLabel`         | `string` |             |
| `unknownCreatorLabel` | `string` |             |

## Auth forms

### `AuthProviderButtons`

**Props**

| Name                      | Type                                            | Optional | Description |
| ------------------------- | ----------------------------------------------- | -------- | ----------- |
| `className`               | `string`                                        | Yes      |             |
| `isSubmitting`            | `boolean`                                       | Yes      |             |
| `onSelect`                | `(providerId: string) => void \| Promise<void>` | No       |             |
| `providerButtonClassName` | `string`                                        | Yes      |             |
| `providers`               | `readonly AuthProviderOption[]`                 | No       |             |

### `AuthSignInForm`

**Props**

### `AuthSignUpForm`

**Props**

## Auth pages

### `ConvexAuthAcceptInvitePage`

**Props**

| Name                      | Type                                                                            | Optional | Description |
| ------------------------- | ------------------------------------------------------------------------------- | -------- | ----------- |
| `buildSignUpUrl`          | `() => string`                                                                  | No       |             |
| `description`             | `string`                                                                        | Yes      |             |
| `eyebrow`                 | `string`                                                                        | Yes      |             |
| `getInvitationEmail`      | `(invitationToken: string, params: URLSearchParams) => Promise<string \| None>` | Yes      |             |
| `inviteOpenFailureError`  | `string`                                                                        | Yes      |             |
| `inviteRecoveryError`     | `string`                                                                        | Yes      |             |
| `inviteRetryFailureError` | `string`                                                                        | Yes      |             |
| `loadingDescription`      | `string`                                                                        | Yes      |             |
| `loadingTitle`            | `string`                                                                        | Yes      |             |
| `onException`             | `(event: ConvexAuthInviteExceptionEvent) => void`                               | Yes      |             |
| `onFailed`                | `(event: ConvexAuthInviteFailureEvent) => void`                                 | Yes      |             |
| `onOpened`                | `(event: ConvexAuthInviteOpenedEvent) => void`                                  | Yes      |             |
| `onRedirected`            | `(event: ConvexAuthInviteRedirectedEvent) => void`                              | Yes      |             |
| `postSignUpPath`          | `string`                                                                        | No       |             |
| `redirectToSignIn`        | `(options: __type) => void \| Promise<void>`                                    | No       |             |
| `signInPath`              | `string`                                                                        | No       |             |
| `signUpPath`              | `string`                                                                        | No       |             |
| `title`                   | `string`                                                                        | Yes      |             |
| `toSafeRedirectPath`      | `(url: string) => string \| undefined`                                          | Yes      |             |
| `unavailableTitle`        | `string`                                                                        | Yes      |             |

### `ConvexAuthActionButton`

No props.

### `ConvexAuthLoadingCard`

No props.

### `ConvexAuthOrganizationChooserPage`

**Props**

| Name                     | Type                                                                 | Optional | Description |
| ------------------------ | -------------------------------------------------------------------- | -------- | ----------- |
| `currentLabel`           | `string`                                                             | Yes      |             |
| `currentOrganization`    | `ConvexAuthCurrentOrganization \| None`                              | Yes      |             |
| `description`            | `string`                                                             | Yes      |             |
| `emptyDescription`       | `string`                                                             | Yes      |             |
| `emptyTitle`             | `string`                                                             | Yes      |             |
| `eyebrow`                | `string`                                                             | Yes      |             |
| `loadingDescription`     | `string`                                                             | Yes      |             |
| `loadingTitle`           | `string`                                                             | Yes      |             |
| `onSelectOrganization`   | `(organization: ConvexAuthOrganizationChooserItem) => Promise<void>` | No       |             |
| `organizations`          | `readonly ConvexAuthOrganizationChooserItem[] \| undefined`          | No       |             |
| `pendingLabel`           | `string`                                                             | Yes      |             |
| `selectErrorDescription` | `string`                                                             | Yes      |             |
| `selectErrorTitle`       | `string`                                                             | Yes      |             |
| `title`                  | `string`                                                             | Yes      |             |

### `ConvexAuthPostSignUpPage`

**Props**

| Name                         | Type                                                     | Optional | Description |
| ---------------------------- | -------------------------------------------------------- | -------- | ----------- |
| `availableOrganizations`     | `readonly SelectableOrganization[] \| None \| undefined` | No       |             |
| `currentOrganization`        | `unknown`                                                | No       |             |
| `description`                | `string`                                                 | Yes      |             |
| `ensureActiveOrganization`   | `() => Promise<unknown>`                                 | No       |             |
| `eyebrow`                    | `string`                                                 | Yes      |             |
| `invitationToken`            | `string \| None`                                         | No       |             |
| `loadingTitle`               | `string`                                                 | Yes      |             |
| `onCurrentOrganizationReady` | `() => void`                                             | No       |             |
| `onOpenOrganizationSetup`    | `() => void \| Promise<void>`                            | No       |             |
| `onRefresh`                  | `() => void`                                             | Yes      |             |
| `openOrganizationSetupLabel` | `string`                                                 | Yes      |             |
| `redeemInvitation`           | `(token: string) => Promise<unknown>`                    | No       |             |
| `refreshLabel`               | `string`                                                 | Yes      |             |
| `timedOutDescription`        | `string`                                                 | Yes      |             |
| `timedOutTitle`              | `string`                                                 | Yes      |             |
| `timeoutMs`                  | `number`                                                 | Yes      |             |
| `title`                      | `string`                                                 | Yes      |             |

### `ConvexAuthSignInPage`

**Props**

### `ConvexAuthSignUpPage`

**Props**

### `ConvexAuthSurface`

**Props**

| Name           | Type                                  | Optional | Description |
| -------------- | ------------------------------------- | -------- | ----------- |
| `children`     | `ReactNode`                           | No       |             |
| `className`    | `string`                              | Yes      |             |
| `classNames`   | `ConvexAuthSurfaceClassNames`         | Yes      |             |
| `description`  | `string`                              | No       |             |
| `eyebrow`      | `string`                              | Yes      |             |
| `features`     | `readonly ConvexAuthSurfaceFeature[]` | Yes      |             |
| `footer`       | `ReactNode`                           | Yes      |             |
| `sidebarBody`  | `string`                              | Yes      |             |
| `sidebarTitle` | `string`                              | Yes      |             |
| `title`        | `string`                              | No       |             |

**classNames keys**

| Key             | Type     | Description |
| --------------- | -------- | ----------- |
| `description`   | `string` |             |
| `eyebrow`       | `string` |             |
| `grid`          | `string` |             |
| `header`        | `string` |             |
| `main`          | `string` |             |
| `mainInner`     | `string` |             |
| `root`          | `string` |             |
| `sidebar`       | `string` |             |
| `sidebarBody`   | `string` |             |
| `sidebarFooter` | `string` |             |
| `sidebarTitle`  | `string` |             |
| `title`         | `string` |             |

### `ConvexAuthUnavailableCard`

No props.

## Auth trigger buttons

### `ConvexAuthSignInButton`

**Props**

| Name               | Type                          | Optional | Description |
| ------------------ | ----------------------------- | -------- | ----------- |
| `children`         | `ReactNode`                   | Yes      |             |
| `redirectToSignIn` | `() => void \| Promise<void>` | No       |             |
| `variant`          | `primary \| secondary`        | Yes      |             |

### `ConvexAuthSignOutButton`

**Props**

| Name       | Type                          | Optional | Description |
| ---------- | ----------------------------- | -------- | ----------- |
| `children` | `ReactNode`                   | Yes      |             |
| `signOut`  | `() => void \| Promise<void>` | No       |             |
| `variant`  | `primary \| secondary`        | Yes      |             |

### `ConvexAuthSignUpButton`

**Props**

| Name               | Type                          | Optional | Description |
| ------------------ | ----------------------------- | -------- | ----------- |
| `children`         | `ReactNode`                   | Yes      |             |
| `redirectToSignUp` | `() => void \| Promise<void>` | No       |             |
| `variant`          | `primary \| secondary`        | Yes      |             |

## Authruntimeprovider

### `AuthRuntimeProvider`

No props.

## Boundaries

### `AuthLoadedBoundaryView`

No props.

### `AuthLoadingBoundaryView`

No props.

### `AuthSignedInBoundary`

No props.

### `AuthSignedOutBoundary`

No props.

## Client screens

### `ConvexAuthClientSignInScreen`

**Props**

| Name                 | Type                                  | Optional | Description                                                           |
| -------------------- | ------------------------------------- | -------- | --------------------------------------------------------------------- |
| `authClient`         | `ConvexBetterAuthClient \| None`      | Yes      |                                                                       |
| `classNames`         | `AuthFormClassNames`                  | Yes      |                                                                       |
| `description`        | `string`                              | Yes      |                                                                       |
| `forceRedirectUrl`   | `string`                              | No       |                                                                       |
| `forgotPasswordHref` | `string`                              | Yes      | When set, AuthSignInForm renders a forgot-password link to this href. |
| `signUpUrl`          | `string`                              | No       |                                                                       |
| `socialProviders`    | `readonly ConvexAuthSocialProvider[]` | Yes      |                                                                       |
| `title`              | `string`                              | Yes      |                                                                       |

**classNames keys**

| Key               | Type     | Description |
| ----------------- | -------- | ----------- |
| `alert`           | `string` |             |
| `card`            | `string` |             |
| `content`         | `string` |             |
| `description`     | `string` |             |
| `divider`         | `string` |             |
| `field`           | `string` |             |
| `footer`          | `string` |             |
| `header`          | `string` |             |
| `input`           | `string` |             |
| `label`           | `string` |             |
| `link`            | `string` |             |
| `primaryButton`   | `string` |             |
| `providerButton`  | `string` |             |
| `providers`       | `string` |             |
| `secondaryButton` | `string` |             |
| `title`           | `string` |             |

### `ConvexAuthClientSignUpScreen`

**Props**

| Name               | Type                                  | Optional | Description |
| ------------------ | ------------------------------------- | -------- | ----------- |
| `authClient`       | `ConvexBetterAuthClient \| None`      | Yes      |             |
| `classNames`       | `AuthFormClassNames`                  | Yes      |             |
| `description`      | `string`                              | Yes      |             |
| `forceRedirectUrl` | `string`                              | No       |             |
| `signInUrl`        | `string`                              | No       |             |
| `socialProviders`  | `readonly ConvexAuthSocialProvider[]` | Yes      |             |
| `title`            | `string`                              | Yes      |             |

**classNames keys**

| Key               | Type     | Description |
| ----------------- | -------- | ----------- |
| `alert`           | `string` |             |
| `card`            | `string` |             |
| `content`         | `string` |             |
| `description`     | `string` |             |
| `divider`         | `string` |             |
| `field`           | `string` |             |
| `footer`          | `string` |             |
| `header`          | `string` |             |
| `input`           | `string` |             |
| `label`           | `string` |             |
| `link`            | `string` |             |
| `primaryButton`   | `string` |             |
| `providerButton`  | `string` |             |
| `providers`       | `string` |             |
| `secondaryButton` | `string` |             |
| `title`           | `string` |             |

## Organizations

### `ConvexCreateOrganization`

**Props**

| Name              | Type                                                              | Optional | Description |
| ----------------- | ----------------------------------------------------------------- | -------- | ----------- |
| `classNames`      | `ConvexCreateOrganizationClassNames`                              | Yes      |             |
| `copy`            | `ConvexCreateOrganizationCopy`                                    | Yes      |             |
| `defaultImageUrl` | `string \| None`                                                  | Yes      |             |
| `defaultName`     | `string`                                                          | Yes      |             |
| `defaultSlug`     | `string`                                                          | Yes      |             |
| `errorMessage`    | `string \| None`                                                  | Yes      |             |
| `isLoading`       | `boolean`                                                         | Yes      |             |
| `onCancel`        | `() => void`                                                      | Yes      |             |
| `onCreate`        | `(input: ConvexCreateOrganizationInput) => void \| Promise<void>` | Yes      |             |
| `renderHeader`    | `(args: __type) => ReactNode`                                     | Yes      |             |

**classNames keys**

| Key               | Type     | Description |
| ----------------- | -------- | ----------- |
| `actions`         | `string` |             |
| `body`            | `string` |             |
| `card`            | `string` |             |
| `description`     | `string` |             |
| `errorBanner`     | `string` |             |
| `field`           | `string` |             |
| `header`          | `string` |             |
| `helper`          | `string` |             |
| `input`           | `string` |             |
| `label`           | `string` |             |
| `primaryButton`   | `string` |             |
| `secondaryButton` | `string` |             |
| `title`           | `string` |             |

**copy keys**

| Key                   | Type     | Description |
| --------------------- | -------- | ----------- |
| `cancelLabel`         | `string` |             |
| `createLabel`         | `string` |             |
| `creatingLabel`       | `string` |             |
| `description`         | `string` |             |
| `imageUrlLabel`       | `string` |             |
| `imageUrlPlaceholder` | `string` |             |
| `invalidSlugError`    | `string` |             |
| `nameLabel`           | `string` |             |
| `namePlaceholder`     | `string` |             |
| `nameRequiredError`   | `string` |             |
| `slugHelper`          | `string` |             |
| `slugLabel`           | `string` |             |
| `slugPlaceholder`     | `string` |             |
| `slugRequiredError`   | `string` |             |
| `title`               | `string` |             |

### `ConvexOrganizationInvitationLinkNotice`

No props.

### `ConvexOrganizationInviteForm`

**Generics:** `<Role>`

**Props**

| Name                   | Type                                      | Optional | Description |
| ---------------------- | ----------------------------------------- | -------- | ----------- |
| `classNames`           | `ConvexOrganizationMembersClassNames`     | Yes      |             |
| `copy`                 | `ConvexOrganizationInviteFormCopy`        | Yes      |             |
| `disabled`             | `boolean`                                 | Yes      |             |
| `inviting`             | `boolean`                                 | No       |             |
| `onEmailChange`        | `(value: string) => void`                 | No       |             |
| `onRoleTemplateChange` | `(value: Role) => void`                   | No       |             |
| `onSubmit`             | `() => void`                              | No       |             |
| `roleOptions`          | `readonly Role[]`                         | No       |             |
| `state`                | `ConvexOrganizationInviteFormState<Role>` | No       |             |

**classNames keys**

| Key                       | Type     | Description |
| ------------------------- | -------- | ----------- |
| `actions`                 | `string` |             |
| `form`                    | `string` |             |
| `formGrid`                | `string` |             |
| `input`                   | `string` |             |
| `label`                   | `string` |             |
| `labelText`               | `string` |             |
| `list`                    | `string` |             |
| `listCard`                | `string` |             |
| `listContent`             | `string` |             |
| `listHeader`              | `string` |             |
| `memberDetails`           | `string` |             |
| `memberEmail`             | `string` |             |
| `memberMetadata`          | `string` |             |
| `memberName`              | `string` |             |
| `primaryButton`           | `string` |             |
| `primaryButtonDisabled`   | `string` |             |
| `secondaryButton`         | `string` |             |
| `secondaryButtonDisabled` | `string` |             |
| `select`                  | `string` |             |
| `stateText`               | `string` |             |
| `status`                  | `string` |             |

**copy keys**

| Key                | Type     | Description |
| ------------------ | -------- | ----------- |
| `emailLabel`       | `string` |             |
| `emailPlaceholder` | `string` |             |
| `roleLabel`        | `string` |             |
| `submitLabel`      | `string` |             |
| `submittingLabel`  | `string` |             |

### `ConvexOrganizationMemberActionErrorNotice`

No props.

### `ConvexOrganizationMemberList`

**Generics:** `<Role, MemberId>`

**Props**

| Name               | Type                                                                 | Optional | Description |
| ------------------ | -------------------------------------------------------------------- | -------- | ----------- |
| `canManageMembers` | `boolean`                                                            | Yes      |             |
| `canManageRoles`   | `boolean`                                                            | Yes      |             |
| `classNames`       | `ConvexOrganizationMembersClassNames`                                | Yes      |             |
| `copy`             | `ConvexOrganizationMembersCopy`                                      | No       |             |
| `formatTimestamp`  | `(timestamp: number) => string`                                      | Yes      |             |
| `members`          | `readonly ConvexOrganizationMemberListItem<MemberId>[] \| undefined` | No       |             |
| `mutatingMemberId` | `MemberId \| None`                                                   | Yes      |             |
| `onReactivate`     | `(membershipId: MemberId) => void`                                   | Yes      |             |
| `onRoleChange`     | `(membershipId: MemberId, roleTemplate: Role) => void`               | Yes      |             |
| `onSuspend`        | `(membershipId: MemberId) => void`                                   | Yes      |             |
| `renderStatus`     | `(status: ConvexOrganizationMemberStatus) => ReactNode`              | Yes      |             |
| `roleOptions`      | `readonly Role[]`                                                    | No       |             |

**classNames keys**

| Key                       | Type     | Description |
| ------------------------- | -------- | ----------- |
| `actions`                 | `string` |             |
| `form`                    | `string` |             |
| `formGrid`                | `string` |             |
| `input`                   | `string` |             |
| `label`                   | `string` |             |
| `labelText`               | `string` |             |
| `list`                    | `string` |             |
| `listCard`                | `string` |             |
| `listContent`             | `string` |             |
| `listHeader`              | `string` |             |
| `memberDetails`           | `string` |             |
| `memberEmail`             | `string` |             |
| `memberMetadata`          | `string` |             |
| `memberName`              | `string` |             |
| `primaryButton`           | `string` |             |
| `primaryButtonDisabled`   | `string` |             |
| `secondaryButton`         | `string` |             |
| `secondaryButtonDisabled` | `string` |             |
| `select`                  | `string` |             |
| `stateText`               | `string` |             |
| `status`                  | `string` |             |

**copy keys**

| Key                      | Type     | Description |
| ------------------------ | -------- | ----------- |
| `emptyMessage`           | `string` |             |
| `lastOwnerDisabledLabel` | `string` |             |
| `loadingMessage`         | `string` |             |
| `reactivateLabel`        | `string` |             |
| `reactivatingLabel`      | `string` |             |
| `roleLabel`              | `string` |             |
| `statusLabel`            | `string` |             |
| `suspendingLabel`        | `string` |             |
| `suspendLabel`           | `string` |             |
| `unknownMemberLabel`     | `string` |             |

### `ConvexOrganizationMembersSurface`

**Generics:** `<Role, MemberId, OrganizationId, InvitationId>`

**Props**

| Name                        | Type                                                                                       | Optional | Description |
| --------------------------- | ------------------------------------------------------------------------------------------ | -------- | ----------- |
| `canManageMembers`          | `boolean`                                                                                  | Yes      |             |
| `canManageRoles`            | `boolean`                                                                                  | Yes      |             |
| `captureEvent`              | `(name: string, properties: Record<string, unknown>) => void`                              | Yes      |             |
| `classNames`                | `ConvexOrganizationMembersClassNames`                                                      | Yes      |             |
| `confirmSuspendMember`      | `(args: __type) => boolean \| Promise<boolean>`                                            | Yes      |             |
| `copy`                      | `ConvexOrganizationMembersSurfaceCopy`                                                     | Yes      |             |
| `defaultInviteRoleTemplate` | `Role`                                                                                     | Yes      |             |
| `getErrorMessage`           | `(error: unknown, fallback: string) => string`                                             | Yes      |             |
| `organizationId`            | `OrganizationId`                                                                           | Yes      |             |
| `refs`                      | `ConvexOrganizationMemberFunctionReferences<Role, MemberId, OrganizationId, InvitationId>` | No       |             |
| `renderActionError`         | `(message: string) => ReactNode`                                                           | Yes      |             |
| `renderInvitationLink`      | `(args: __type) => ReactNode`                                                              | Yes      |             |
| `renderStatus`              | `(status: ConvexOrganizationMemberStatus) => ReactNode`                                    | Yes      |             |
| `roleOptions`               | `readonly Role[]`                                                                          | No       |             |

**classNames keys**

| Key                       | Type     | Description |
| ------------------------- | -------- | ----------- |
| `actions`                 | `string` |             |
| `form`                    | `string` |             |
| `formGrid`                | `string` |             |
| `input`                   | `string` |             |
| `label`                   | `string` |             |
| `labelText`               | `string` |             |
| `list`                    | `string` |             |
| `listCard`                | `string` |             |
| `listContent`             | `string` |             |
| `listHeader`              | `string` |             |
| `memberDetails`           | `string` |             |
| `memberEmail`             | `string` |             |
| `memberMetadata`          | `string` |             |
| `memberName`              | `string` |             |
| `primaryButton`           | `string` |             |
| `primaryButtonDisabled`   | `string` |             |
| `secondaryButton`         | `string` |             |
| `secondaryButtonDisabled` | `string` |             |
| `select`                  | `string` |             |
| `stateText`               | `string` |             |
| `status`                  | `string` |             |

**copy keys**

| Key                   | Type                                     | Description |
| --------------------- | ---------------------------------------- | ----------- |
| `actionErrorTitle`    | `string`                                 |             |
| `invitationLinkTitle` | `string`                                 |             |
| `invite`              | `ConvexOrganizationInviteFormCopy`       |             |
| `members`             | `Partial<ConvexOrganizationMembersCopy>` |             |

### `ConvexOrganizationList`

**Props**

| Name                    | Type                                                | Optional | Description |
| ----------------------- | --------------------------------------------------- | -------- | ----------- |
| `classNames`            | `ConvexOrgListClassNames`                           | Yes      |             |
| `copy`                  | `ConvexOrgListCopy`                                 | Yes      |             |
| `currentOrganizationId` | `string \| None`                                    | Yes      |             |
| `invitations`           | `readonly ConvexOrgListInvitation[]`                | Yes      |             |
| `isLoading`             | `boolean`                                           | Yes      |             |
| `onAcceptInvitation`    | `(invitationId: string) => void \| Promise<void>`   | Yes      |             |
| `onCreateOrganization`  | `() => void \| Promise<void>`                       | Yes      |             |
| `onRejectInvitation`    | `(invitationId: string) => void \| Promise<void>`   | Yes      |             |
| `onSelectOrganization`  | `(organizationId: string) => void \| Promise<void>` | No       |             |
| `organizations`         | `readonly ConvexOrgListOrganization[]`              | No       |             |
| `showInvitations`       | `boolean`                                           | Yes      |             |

**classNames keys**

| Key               | Type     | Description |
| ----------------- | -------- | ----------- |
| `actionButton`    | `string` |             |
| `body`            | `string` |             |
| `card`            | `string` |             |
| `dangerButton`    | `string` |             |
| `description`     | `string` |             |
| `divider`         | `string` |             |
| `emptyState`      | `string` |             |
| `header`          | `string` |             |
| `invitationItem`  | `string` |             |
| `invitationMeta`  | `string` |             |
| `orgImage`        | `string` |             |
| `orgItem`         | `string` |             |
| `orgItemActive`   | `string` |             |
| `orgMeta`         | `string` |             |
| `orgName`         | `string` |             |
| `orgPlaceholder`  | `string` |             |
| `primaryButton`   | `string` |             |
| `secondaryButton` | `string` |             |
| `title`           | `string` |             |

**copy keys**

| Key                    | Type     | Description |
| ---------------------- | -------- | ----------- |
| `acceptLabel`          | `string` |             |
| `createLabel`          | `string` |             |
| `currentLabel`         | `string` |             |
| `description`          | `string` |             |
| `expiresLabel`         | `string` |             |
| `invitationsLabel`     | `string` |             |
| `membershipsLabel`     | `string` |             |
| `noInvitationsLabel`   | `string` |             |
| `noOrganizationsLabel` | `string` |             |
| `rejectLabel`          | `string` |             |
| `selectLabel`          | `string` |             |
| `title`                | `string` |             |

### `ConvexOrganizationPermissionChecklist`

No props.

### `ConvexOrganizationRoleActionErrorNotice`

No props.

### `ConvexOrganizationRoleCreateForm`

No props.

### `ConvexOrganizationRoleList`

**Generics:** `<RoleId>`

No props.

### `ConvexOrganizationRoleManagerSurface`

**Generics:** `<RoleId>`

**Props**

| Name                  | Type                                                                           | Optional | Description |
| --------------------- | ------------------------------------------------------------------------------ | -------- | ----------- |
| `buildCreateRoleArgs` | `(state: ConvexOrganizationRoleFormState) => ConvexOrganizationCreateRoleArgs` | Yes      |             |
| `canCreateRoles`      | `boolean`                                                                      | Yes      |             |
| `captureEvent`        | `(name: string, properties: Record<string, unknown>) => void`                  | Yes      |             |
| `classNames`          | `ConvexOrganizationRoleManagerClassNames`                                      | Yes      |             |
| `copy`                | `ConvexOrganizationRoleManagerCopy`                                            | Yes      |             |
| `getErrorMessage`     | `(error: unknown, fallback: string) => string`                                 | Yes      |             |
| `refs`                | `ConvexOrganizationRoleManagerFunctionReferences<RoleId>`                      | No       |             |
| `renderActionError`   | `(message: string) => ReactNode`                                               | Yes      |             |

**classNames keys**

| Key                     | Type     | Description |
| ----------------------- | -------- | ----------- |
| `badge`                 | `string` |             |
| `checkbox`              | `string` |             |
| `error`                 | `string` |             |
| `field`                 | `string` |             |
| `form`                  | `string` |             |
| `input`                 | `string` |             |
| `label`                 | `string` |             |
| `labelText`             | `string` |             |
| `list`                  | `string` |             |
| `listCard`              | `string` |             |
| `listContent`           | `string` |             |
| `permissionDescription` | `string` |             |
| `permissionGrid`        | `string` |             |
| `permissionItem`        | `string` |             |
| `permissionKey`         | `string` |             |
| `primaryButton`         | `string` |             |
| `primaryButtonDisabled` | `string` |             |
| `roleHeader`            | `string` |             |
| `roleName`              | `string` |             |
| `rolePermissions`       | `string` |             |
| `sectionTitle`          | `string` |             |
| `stateText`             | `string` |             |

**copy keys**

| Key                             | Type     | Description |
| ------------------------------- | -------- | ----------- |
| `actionErrorTitle`              | `string` |             |
| `createTitle`                   | `string` |             |
| `creatingLabel`                 | `string` |             |
| `customRoleLabel`               | `string` |             |
| `emptyMessage`                  | `string` |             |
| `loadingMessage`                | `string` |             |
| `nameLabel`                     | `string` |             |
| `namePlaceholder`               | `string` |             |
| `permissionCatalogEmptyMessage` | `string` |             |
| `permissionLabel`               | `string` |             |
| `roleListTitle`                 | `string` |             |
| `submitLabel`                   | `string` |             |
| `systemRoleLabel`               | `string` |             |

### `ConvexOrganizationProfile`

**Props**

| Name                  | Type                                                            | Optional | Description                                            |
| --------------------- | --------------------------------------------------------------- | -------- | ------------------------------------------------------ |
| `classNames`          | `ConvexOrgProfileClassNames`                                    | Yes      |                                                        |
| `copy`                | `ConvexOrgProfileCopy`                                          | Yes      |                                                        |
| `isAdmin`             | `boolean`                                                       | Yes      |                                                        |
| `isLoading`           | `boolean`                                                       | Yes      |                                                        |
| `onDelete`            | `() => void \| Promise<void>`                                   | Yes      |                                                        |
| `onUpdate`            | `(input: ConvexOrgProfileUpdateInput) => void \| Promise<void>` | Yes      |                                                        |
| `organization`        | `ConvexOrgProfileOrganization \| None \| undefined`             | No       |                                                        |
| `renderDeleteConfirm` | `(args: __type) => ReactNode`                                   | Yes      |                                                        |
| `showBrandFields`     | `boolean`                                                       | Yes      | When false, brand fields are hidden (default true).    |
| `showSecurityFields`  | `boolean`                                                       | Yes      | When false, security fields are hidden (default true). |

**classNames keys**

| Key               | Type     | Description |
| ----------------- | -------- | ----------- |
| `actions`         | `string` |             |
| `body`            | `string` |             |
| `card`            | `string` |             |
| `dangerButton`    | `string` |             |
| `description`     | `string` |             |
| `field`           | `string` |             |
| `header`          | `string` |             |
| `image`           | `string` |             |
| `input`           | `string` |             |
| `label`           | `string` |             |
| `primaryButton`   | `string` |             |
| `secondaryButton` | `string` |             |
| `statusBadge`     | `string` |             |
| `title`           | `string` |             |
| `value`           | `string` |             |

**copy keys**

| Key                         | Type     | Description |
| --------------------------- | -------- | ----------- |
| `accentColorLabel`          | `string` |             |
| `activeStatus`              | `string` |             |
| `brandSectionTitle`         | `string` |             |
| `cancelLabel`               | `string` |             |
| `confirmDeleteDescription`  | `string` |             |
| `confirmDeleteTitle`        | `string` |             |
| `deleteLabel`               | `string` |             |
| `description`               | `string` |             |
| `editLabel`                 | `string` |             |
| `emailFromNameLabel`        | `string` |             |
| `emailReplyToLabel`         | `string` |             |
| `nameLabel`                 | `string` |             |
| `primaryColorLabel`         | `string` |             |
| `requireMfaDisabled`        | `string` |             |
| `requireMfaEnabled`         | `string` |             |
| `requireMfaLabel`           | `string` |             |
| `saveLabel`                 | `string` |             |
| `savingLabel`               | `string` |             |
| `securitySectionTitle`      | `string` |             |
| `sessionTimeoutLabel`       | `string` |             |
| `sessionTimeoutPlaceholder` | `string` |             |
| `slugLabel`                 | `string` |             |
| `statusLabel`               | `string` |             |
| `suspendedStatus`           | `string` |             |
| `title`                     | `string` |             |
| `websiteLabel`              | `string` |             |

### `ConvexOrganizationSwitcher`

**Props**

| Name                          | Type                                                | Optional | Description |
| ----------------------------- | --------------------------------------------------- | -------- | ----------- |
| `classNames`                  | `ConvexOrgSwitcherClassNames`                       | Yes      |             |
| `copy`                        | `ConvexOrgSwitcherCopy`                             | Yes      |             |
| `currentOrganization`         | `ConvexOrgSwitcherOrganization \| None`             | Yes      |             |
| `currentOrganizationId`       | `string \| None`                                    | Yes      |             |
| `enableSearch`                | `boolean`                                           | Yes      |             |
| `onCreateOrganization`        | `() => void \| Promise<void>`                       | Yes      |             |
| `onInPlaceCreateOrganization` | `(name: string) => void \| Promise<void>`           | Yes      |             |
| `onSelectOrganization`        | `(organizationId: string) => void \| Promise<void>` | No       |             |
| `onSelectPersonalAccount`     | `() => void \| Promise<void>`                       | Yes      |             |
| `organizations`               | `readonly ConvexOrgSwitcherOrganization[]`          | No       |             |
| `personalAccountLabel`        | `string`                                            | Yes      |             |
| `renderCustomTrigger`         | `(args: __type) => ReactNode`                       | Yes      |             |
| `showPersonalAccount`         | `boolean`                                           | Yes      |             |

**classNames keys**

| Key                    | Type     | Description |
| ---------------------- | -------- | ----------- |
| `createButton`         | `string` |             |
| `dropdown`             | `string` |             |
| `dropdownDivider`      | `string` |             |
| `dropdownItem`         | `string` |             |
| `dropdownItemActive`   | `string` |             |
| `dropdownItemLabel`    | `string` |             |
| `dropdownItemMeta`     | `string` |             |
| `dropdownPanel`        | `string` |             |
| `dropdownSection`      | `string` |             |
| `dropdownSectionTitle` | `string` |             |
| `inPlaceCreateButton`  | `string` |             |
| `inPlaceCreateCancel`  | `string` |             |
| `inPlaceCreateForm`    | `string` |             |
| `inPlaceCreateInput`   | `string` |             |
| `searchInput`          | `string` |             |
| `trigger`              | `string` |             |
| `triggerImage`         | `string` |             |
| `triggerName`          | `string` |             |
| `triggerPlaceholder`   | `string` |             |

**copy keys**

| Key                        | Type     | Description |
| -------------------------- | -------- | ----------- |
| `createOrganizationLabel`  | `string` |             |
| `currentOrganizationLabel` | `string` |             |
| `inPlaceCreateButtonLabel` | `string` |             |
| `inPlaceCreateCancelLabel` | `string` |             |
| `inPlaceCreatePlaceholder` | `string` |             |
| `noOrganizationsLabel`     | `string` |             |
| `otherOrganizationsLabel`  | `string` |             |
| `personalAccountLabel`     | `string` |             |
| `searchPlaceholder`        | `string` |             |

## Providers & runtime

### `ConvexAuthClientContextProvider`

No props.

### `ConvexAuthClientProvider`

**Props**

| Name                  | Type                               | Optional | Description |
| --------------------- | ---------------------------------- | -------- | ----------- |
| `actions`             | `NativeAuthActions`                | No       |             |
| `children`            | `ReactNode`                        | No       |             |
| `initialRefreshToken` | `string \| None`                   | Yes      |             |
| `initialSessionId`    | `string \| None`                   | Yes      |             |
| `initialToken`        | `string \| None`                   | Yes      |             |
| `storage`             | `local \| session \| TokenStorage` | Yes      |             |

### `ConvexAuthConvexIdentityProvisioner`

**Props**

| Name                   | Type                                                      | Optional | Description |
| ---------------------- | --------------------------------------------------------- | -------- | ----------- |
| `auth`                 | `ConvexAuthState`                                         | No       |             |
| `getCurrentUser`       | `FunctionReference<query, public, EmptyArgs, unknown>`    | No       |             |
| `provisionCurrentUser` | `FunctionReference<mutation, public, EmptyArgs, unknown>` | No       |             |

### `ConvexAuthProvider`

**Props**

| Name                  | Type                               | Optional | Description |
| --------------------- | ---------------------------------- | -------- | ----------- |
| `actions`             | `NativeAuthActions`                | No       |             |
| `children`            | `ReactNode`                        | No       |             |
| `initialRefreshToken` | `string \| None`                   | Yes      |             |
| `initialSessionId`    | `string \| None`                   | Yes      |             |
| `initialToken`        | `string \| None`                   | Yes      |             |
| `storage`             | `local \| session \| TokenStorage` | Yes      |             |

## Security

### `ConvexSecurityAuditList`

**Props**

| Name              | Type                                                  | Optional | Description |
| ----------------- | ----------------------------------------------------- | -------- | ----------- |
| `classNames`      | `ConvexSecurityAuditListClassNames`                   | Yes      |             |
| `copy`            | `ConvexSecurityAuditListCopy`                         | No       |             |
| `formatCreatedAt` | `(createdAt: number) => string`                       | Yes      |             |
| `logs`            | `readonly ConvexSecurityAuditListItem[] \| undefined` | No       |             |
| `renderBadge`     | `(args: __type) => ReactNode`                         | Yes      |             |

**classNames keys**

| Key              | Type     | Description |
| ---------------- | -------- | ----------- |
| `action`         | `string` |             |
| `badge`          | `string` |             |
| `details`        | `string` |             |
| `list`           | `string` |             |
| `metadata`       | `string` |             |
| `row`            | `string` |             |
| `rowContent`     | `string` |             |
| `rowHeader`      | `string` |             |
| `secondaryBadge` | `string` |             |
| `stateText`      | `string` |             |
| `title`          | `string` |             |

**copy keys**

| Key                | Type     | Description |
| ------------------ | -------- | ----------- |
| `afterLabel`       | `string` |             |
| `beforeLabel`      | `string` |             |
| `emptyMessage`     | `string` |             |
| `loadingMessage`   | `string` |             |
| `systemActorLabel` | `string` |             |
| `userAgentLabel`   | `string` |             |

### `ConvexSecurityAuditRow`

**Props**

| Name              | Type                                   | Optional | Description |
| ----------------- | -------------------------------------- | -------- | ----------- |
| `classNames`      | `ConvexSecurityAuditListClassNames`    | Yes      |             |
| `copy`            | `Partial<ConvexSecurityAuditListCopy>` | Yes      |             |
| `formatCreatedAt` | `(createdAt: number) => string`        | Yes      |             |
| `log`             | `ConvexSecurityAuditListItem`          | No       |             |
| `renderBadge`     | `(args: __type) => ReactNode`          | Yes      |             |

**classNames keys**

| Key              | Type     | Description |
| ---------------- | -------- | ----------- |
| `action`         | `string` |             |
| `badge`          | `string` |             |
| `details`        | `string` |             |
| `list`           | `string` |             |
| `metadata`       | `string` |             |
| `row`            | `string` |             |
| `rowContent`     | `string` |             |
| `rowHeader`      | `string` |             |
| `secondaryBadge` | `string` |             |
| `stateText`      | `string` |             |
| `title`          | `string` |             |

## Shared UI primitives

### `AuthAlert`

No props.

### `AuthButton`

No props.

### `AuthCard`

No props.

### `AuthCardContent`

No props.

### `AuthCardHeader`

No props.

### `AuthDivider`

No props.

### `AuthField`

No props.

### `AuthInput`

No props.

### `AuthLabel`

No props.

### `AuthProviderButton`

No props.

### `AuthRuntimeStatusBadge`

No props.

### `AuthRuntimeSummary`

No props.

### `AuthScreen`

No props.

## Theming

### `ConvexAuthAppearanceProvider`

**Props**

| Name           | Type              | Optional | Description |
| -------------- | ----------------- | -------- | ----------- |
| `children`     | `ReactNode`       | No       |             |
| `defaultTheme` | `ConvexAuthTheme` | Yes      |             |
| `enableSystem` | `boolean`         | Yes      |             |
| `storageKey`   | `string`          | Yes      |             |

## Unknown

### `AuthInvitationEmailTemplate`

**Props**

| Name               | Type     | Optional | Description |
| ------------------ | -------- | -------- | ----------- |
| `acceptUrl`        | `string` | No       |             |
| `expiresAt`        | `Date`   | No       |             |
| `inviterLabel`     | `string` | No       |             |
| `organizationName` | `string` | No       |             |
| `roleName`         | `string` | No       |             |

## User profile

### `ConvexChangeEmailForm`

**Props**

| Name                | Type                              | Optional | Description                                                              |
| ------------------- | --------------------------------- | -------- | ------------------------------------------------------------------------ |
| `authClient`        | `ConvexBetterAuthClient \| None`  | Yes      |                                                                          |
| `classNames`        | `ConvexChangeEmailFormClassNames` | Yes      |                                                                          |
| `copy`              | `ConvexChangeEmailFormCopy`       | Yes      |                                                                          |
| `currentEmail`      | `string \| None`                  | Yes      | The user's current email, displayed read-only above the new-email field. |
| `onRequested`       | `(newEmail: string) => void`      | Yes      |                                                                          |
| `verifyCallbackUrl` | `string`                          | Yes      | Absolute URL of the verify-email page on this app. Better-Auth           |
| appends             |

**classNames keys**

| Key            | Type     | Description |
| -------------- | -------- | ----------- |
| `errorState`   | `string` |             |
| `field`        | `string` |             |
| `form`         | `string` |             |
| `input`        | `string` |             |
| `label`        | `string` |             |
| `root`         | `string` |             |
| `submitButton` | `string` |             |
| `successState` | `string` |             |

**copy keys**

| Key                    | Type     | Description |
| ---------------------- | -------- | ----------- |
| `currentEmailLabel`    | `string` |             |
| `description`          | `string` |             |
| `newEmailLabel`        | `string` |             |
| `newEmailPlaceholder`  | `string` |             |
| `sameAsCurrentMessage` | `string` |             |
| `submit`               | `string` |             |
| `submitting`           | `string` |             |
| `successMessage`       | `string` |             |
| `title`                | `string` |             |
| `unavailable`          | `string` |             |

### `ConvexEnableTwoFactorForm`

**Props**

| Name         | Type                                  | Optional | Description                                                       |
| ------------ | ------------------------------------- | -------- | ----------------------------------------------------------------- |
| `authClient` | `ConvexBetterAuthClient \| None`      | Yes      |                                                                   |
| `classNames` | `ConvexEnableTwoFactorFormClassNames` | Yes      |                                                                   |
| `copy`       | `ConvexEnableTwoFactorFormCopy`       | Yes      |                                                                   |
| `issuer`     | `string`                              | Yes      | Authenticator label shown alongside the account (e.g. "Pile").    |
| `onEnrolled` | `() => void`                          | Yes      | Fired once enrollment is fully confirmed (after the backup step). |
| `renderQR`   | `(totpURI: string) => ReactNode`      | Yes      | Optional QR renderer. Receives the                                |

**classNames keys**

| Key            | Type     | Description |
| -------------- | -------- | ----------- |
| `backupCode`   | `string` |             |
| `backupCodes`  | `string` |             |
| `errorState`   | `string` |             |
| `field`        | `string` |             |
| `form`         | `string` |             |
| `input`        | `string` |             |
| `label`        | `string` |             |
| `qr`           | `string` |             |
| `root`         | `string` |             |
| `secret`       | `string` |             |
| `submitButton` | `string` |             |
| `successState` | `string` |             |

**copy keys**

| Key                   | Type     | Description |
| --------------------- | -------- | ----------- |
| `backupDescription`   | `string` |             |
| `backupTitle`         | `string` |             |
| `codeLabel`           | `string` |             |
| `codePlaceholder`     | `string` |             |
| `description`         | `string` |             |
| `done`                | `string` |             |
| `passwordLabel`       | `string` |             |
| `passwordPlaceholder` | `string` |             |
| `passwordSubmit`      | `string` |             |
| `secretLabel`         | `string` |             |
| `submitting`          | `string` |             |
| `title`               | `string` |             |
| `unavailable`         | `string` |             |
| `verifyDescription`   | `string` |             |
| `verifySubmit`        | `string` |             |
| `verifyTitle`         | `string` |             |

### `ConvexForgotPasswordForm`

**Props**

| Name               | Type                                 | Optional | Description                                                      |
| ------------------ | ------------------------------------ | -------- | ---------------------------------------------------------------- |
| `authClient`       | `ConvexBetterAuthClient \| None`     | Yes      |                                                                  |
| `classNames`       | `ConvexForgotPasswordFormClassNames` | Yes      |                                                                  |
| `copy`             | `ConvexForgotPasswordFormCopy`       | Yes      |                                                                  |
| `onRequested`      | `(email: string) => void`            | Yes      |                                                                  |
| `resetPasswordUrl` | `string`                             | No       | Absolute URL of the reset-password page on this app. Better-Auth |
| appends            |

**classNames keys**

| Key            | Type     | Description |
| -------------- | -------- | ----------- |
| `errorState`   | `string` |             |
| `field`        | `string` |             |
| `form`         | `string` |             |
| `input`        | `string` |             |
| `label`        | `string` |             |
| `root`         | `string` |             |
| `submitButton` | `string` |             |
| `successState` | `string` |             |

**copy keys**

| Key                | Type     | Description |
| ------------------ | -------- | ----------- |
| `description`      | `string` |             |
| `emailLabel`       | `string` |             |
| `emailPlaceholder` | `string` |             |
| `submit`           | `string` |             |
| `submitting`       | `string` |             |
| `successMessage`   | `string` |             |
| `title`            | `string` |             |
| `unavailable`      | `string` |             |

### `ConvexProfileEditForm`

**Props**

| Name                                                   | Type                              | Optional | Description                                                   |
| ------------------------------------------------------ | --------------------------------- | -------- | ------------------------------------------------------------- |
| `authClient`                                           | `ConvexBetterAuthClient \| None`  | Yes      |                                                               |
| `classNames`                                           | `ConvexProfileEditFormClassNames` | Yes      |                                                               |
| `copy`                                                 | `ConvexProfileEditFormCopy`       | Yes      |                                                               |
| `initialImage`                                         | `string`                          | Yes      |                                                               |
| `initialName`                                          | `string`                          | Yes      |                                                               |
| `onUpdated`                                            | `(next: __type) => void`          | Yes      |                                                               |
| `showImageField`                                       | `boolean`                         | Yes      | Whether to show the image URL field. Defaults to true. Set to |
| false for consumers that don't surface avatar editing. |

**classNames keys**

| Key            | Type     | Description |
| -------------- | -------- | ----------- |
| `errorState`   | `string` |             |
| `field`        | `string` |             |
| `form`         | `string` |             |
| `input`        | `string` |             |
| `label`        | `string` |             |
| `root`         | `string` |             |
| `submitButton` | `string` |             |
| `successState` | `string` |             |

**copy keys**

| Key              | Type     | Description |
| ---------------- | -------- | ----------- |
| `description`    | `string` |             |
| `imageLabel`     | `string` |             |
| `nameLabel`      | `string` |             |
| `submit`         | `string` |             |
| `submitting`     | `string` |             |
| `successMessage` | `string` |             |
| `title`          | `string` |             |
| `unavailable`    | `string` |             |

### `ConvexProfileImageUploader`

**Props**

| Name           | Type                                        | Optional | Description                                                    |
| -------------- | ------------------------------------------- | -------- | -------------------------------------------------------------- |
| `accept`       | `string`                                    | Yes      | File-input                                                     |
| `authClient`   | `ConvexBetterAuthClient \| None`            | Yes      |                                                                |
| `classNames`   | `ConvexProfileImageUploaderClassNames`      | Yes      |                                                                |
| `copy`         | `ConvexProfileImageUploaderCopy`            | Yes      |                                                                |
| `initialImage` | `string \| None`                            | Yes      |                                                                |
| `onUploaded`   | `(url: string) => void`                     | Yes      |                                                                |
| `uploadFile`   | `(file: Blob \| string) => Promise<string>` | No       | Consumer-provided upload strategy. Receives the picked file (a |
| browser        |

**classNames keys**

| Key            | Type     | Description |
| -------------- | -------- | ----------- |
| `errorState`   | `string` |             |
| `noPreview`    | `string` |             |
| `pickButton`   | `string` |             |
| `preview`      | `string` |             |
| `root`         | `string` |             |
| `successState` | `string` |             |

**copy keys**

| Key              | Type     | Description |
| ---------------- | -------- | ----------- |
| `description`    | `string` |             |
| `noImage`        | `string` |             |
| `pick`           | `string` |             |
| `successMessage` | `string` |             |
| `title`          | `string` |             |
| `unavailable`    | `string` |             |
| `uploading`      | `string` |             |

### `ConvexResetPasswordForm`

**Props**

| Name                                  | Type                                | Optional | Description                                                     |
| ------------------------------------- | ----------------------------------- | -------- | --------------------------------------------------------------- |
| `authClient`                          | `ConvexBetterAuthClient \| None`    | Yes      |                                                                 |
| `classNames`                          | `ConvexResetPasswordFormClassNames` | Yes      |                                                                 |
| `copy`                                | `ConvexResetPasswordFormCopy`       | Yes      |                                                                 |
| `minPasswordLength`                   | `number`                            | Yes      | Minimum new-password length to enforce client-side. Defaults to |
| 12 (matches the package's server-side |
| `onReset`                             | `() => void`                        | Yes      |                                                                 |
| `token`                               | `string`                            | No       | Reset token from the recovery email (typically                  |

**classNames keys**

| Key            | Type     | Description |
| -------------- | -------- | ----------- |
| `errorState`   | `string` |             |
| `field`        | `string` |             |
| `form`         | `string` |             |
| `input`        | `string` |             |
| `label`        | `string` |             |
| `root`         | `string` |             |
| `submitButton` | `string` |             |
| `successState` | `string` |             |

**copy keys**

| Key                    | Type     | Description |
| ---------------------- | -------- | ----------- |
| `confirmPasswordLabel` | `string` |             |
| `description`          | `string` |             |
| `minLengthMessage`     | `string` |             |
| `mismatchMessage`      | `string` |             |
| `missingTokenMessage`  | `string` |             |
| `passwordLabel`        | `string` |             |
| `submit`               | `string` |             |
| `submitting`           | `string` |             |
| `successMessage`       | `string` |             |
| `title`                | `string` |             |
| `unavailable`          | `string` |             |

### `ConvexSessionList`

**Props**

| Name                  | Type                             | Optional | Description                                                   |
| --------------------- | -------------------------------- | -------- | ------------------------------------------------------------- |
| `authClient`          | `ConvexBetterAuthClient \| None` | Yes      |                                                               |
| `classNames`          | `ConvexSessionListClassNames`    | Yes      |                                                               |
| `copy`                | `ConvexSessionListCopy`          | Yes      |                                                               |
| `currentSessionToken` | `string \| None`                 | Yes      | Token of the session currently powering this browser. Used to |

mark the row as the active session and to suppress the
"revoke" button on it (revoking your own session is sign-out,
which is a separate action from "revoke that other device"). |
| `formatTimestamp` | `(value: string \| Date) => string` | Yes | |
| `showRevokeOthersAction` | `boolean` | Yes | Render a "Revoke all other sessions" button next to the title.
Defaults to true. Hides when no other sessions exist. |

**classNames keys**

| Key            | Type     | Description |
| -------------- | -------- | ----------- |
| `emptyState`   | `string` |             |
| `errorState`   | `string` |             |
| `item`         | `string` |             |
| `itemCurrent`  | `string` |             |
| `itemMeta`     | `string` |             |
| `list`         | `string` |             |
| `loadingState` | `string` |             |
| `revokeButton` | `string` |             |
| `root`         | `string` |             |

**copy keys**

| Key                    | Type     | Description |
| ---------------------- | -------- | ----------- |
| `currentBadge`         | `string` |             |
| `description`          | `string` |             |
| `empty`                | `string` |             |
| `lastActivePrefix`     | `string` |             |
| `loading`              | `string` |             |
| `revoke`               | `string` |             |
| `revokeOthersButton`   | `string` |             |
| `revoking`             | `string` |             |
| `revokingOthersButton` | `string` |             |
| `title`                | `string` |             |
| `unavailable`          | `string` |             |

### `ConvexUserButton`

**Props**

| Name                     | Type                                                | Optional | Description |
| ------------------------ | --------------------------------------------------- | -------- | ----------- |
| `classNames`             | `ConvexUserButtonClassNames`                        | Yes      |             |
| `copy`                   | `ConvexUserButtonCopy`                              | Yes      |             |
| `currentOrganizationId`  | `string \| None`                                    | Yes      |             |
| `onCreateOrganization`   | `() => void \| Promise<void>`                       | Yes      |             |
| `onManageAccount`        | `() => void \| Promise<void>`                       | Yes      |             |
| `onManageOrganization`   | `() => void \| Promise<void>`                       | Yes      |             |
| `onSelectOrganization`   | `(organizationId: string) => void \| Promise<void>` | Yes      |             |
| `onSignOut`              | `() => void \| Promise<void>`                       | Yes      |             |
| `organizations`          | `readonly ConvexUserButtonOrganizationItem[]`       | Yes      |             |
| `renderCustomTrigger`    | `(args: __type) => ReactNode`                       | Yes      |             |
| `showManageOrganization` | `boolean`                                           | Yes      |             |
| `user`                   | `ConvexUserButtonUser \| None \| undefined`         | No       |             |

**classNames keys**

| Key                    | Type     | Description |
| ---------------------- | -------- | ----------- |
| `avatar`               | `string` |             |
| `dropdown`             | `string` |             |
| `dropdownDivider`      | `string` |             |
| `dropdownItem`         | `string` |             |
| `dropdownItemActive`   | `string` |             |
| `dropdownItemLabel`    | `string` |             |
| `dropdownItemMeta`     | `string` |             |
| `dropdownPanel`        | `string` |             |
| `dropdownSection`      | `string` |             |
| `dropdownSectionTitle` | `string` |             |
| `initials`             | `string` |             |
| `signOutButton`        | `string` |             |
| `trigger`              | `string` |             |

**copy keys**

| Key                       | Type     | Description |
| ------------------------- | -------- | ----------- |
| `createOrganizationLabel` | `string` |             |
| `manageAccountLabel`      | `string` |             |
| `manageOrganizationLabel` | `string` |             |
| `personalAccountLabel`    | `string` |             |
| `signedInAsLabel`         | `string` |             |
| `signOutLabel`            | `string` |             |
| `switchOrganizationLabel` | `string` |             |

### `ConvexUserProfile`

**Props**

| Name                  | Type                                         | Optional | Description |
| --------------------- | -------------------------------------------- | -------- | ----------- |
| `classNames`          | `ConvexUserProfileClassNames`                | Yes      |             |
| `copy`                | `ConvexUserProfileCopy`                      | Yes      |             |
| `errorMessage`        | `string \| None`                             | Yes      |             |
| `isAdmin`             | `boolean`                                    | Yes      |             |
| `isLoading`           | `boolean`                                    | Yes      |             |
| `onChangePassword`    | `() => void \| Promise<void>`                | Yes      |             |
| `onDeleteAccount`     | `() => void \| Promise<void>`                | Yes      |             |
| `onManageTwoFactor`   | `() => void \| Promise<void>`                | Yes      |             |
| `onUpdateProfile`     | `(input: __type) => void \| Promise<void>`   | Yes      |             |
| `renderDeleteConfirm` | `(args: __type) => ReactNode`                | Yes      |             |
| `user`                | `ConvexUserProfileUser \| None \| undefined` | No       |             |

**classNames keys**

| Key                | Type     | Description |
| ------------------ | -------- | ----------- |
| `actions`          | `string` |             |
| `body`             | `string` |             |
| `card`             | `string` |             |
| `dangerButton`     | `string` |             |
| `description`      | `string` |             |
| `errorBanner`      | `string` |             |
| `field`            | `string` |             |
| `header`           | `string` |             |
| `image`            | `string` |             |
| `imagePlaceholder` | `string` |             |
| `input`            | `string` |             |
| `label`            | `string` |             |
| `primaryButton`    | `string` |             |
| `providerItem`     | `string` |             |
| `providerLabel`    | `string` |             |
| `secondaryButton`  | `string` |             |
| `sectionBody`      | `string` |             |
| `sectionDivider`   | `string` |             |
| `sectionTitle`     | `string` |             |
| `title`            | `string` |             |
| `value`            | `string` |             |

**copy keys**

| Key                        | Type     | Description |
| -------------------------- | -------- | ----------- |
| `cancelLabel`              | `string` |             |
| `changePasswordLabel`      | `string` |             |
| `confirmDeleteDescription` | `string` |             |
| `confirmDeleteTitle`       | `string` |             |
| `connectedAccountsLabel`   | `string` |             |
| `deleteAccountLabel`       | `string` |             |
| `description`              | `string` |             |
| `editLabel`                | `string` |             |
| `emailLabel`               | `string` |             |
| `imageUrlLabel`            | `string` |             |
| `imageUrlPlaceholder`      | `string` |             |
| `nameLabel`                | `string` |             |
| `nameRequiredError`        | `string` |             |
| `notVerifiedLabel`         | `string` |             |
| `saveLabel`                | `string` |             |
| `savingLabel`              | `string` |             |
| `securityLabel`            | `string` |             |
| `title`                    | `string` |             |
| `twoFactorLabel`           | `string` |             |
| `verifiedLabel`            | `string` |             |

### `ConvexVerifyEmailScreen`

**Props**

| Name                | Type                                | Optional | Description                                                           |
| ------------------- | ----------------------------------- | -------- | --------------------------------------------------------------------- |
| `authClient`        | `ConvexBetterAuthClient \| None`    | Yes      |                                                                       |
| `classNames`        | `ConvexVerifyEmailScreenClassNames` | Yes      |                                                                       |
| `copy`              | `ConvexVerifyEmailScreenCopy`       | Yes      |                                                                       |
| `onVerified`        | `() => void`                        | Yes      | Called on successful verification (after the verify call returns ok). |
| `resendCallbackUrl` | `string`                            | Yes      | Absolute URL of this verify-email page on this app. Better-Auth       |
| appends a fresh     |
| `token`             | `string`                            | No       | Token from the verification email's                                   |
| `userEmail`         | `string \| None`                    | Yes      | The current user's email, if signed in. Required to enable the        |

resend-verification button. If absent, the resend button is
hidden (no way to know which email to resend to). |

**classNames keys**

| Key                 | Type     | Description |
| ------------------- | -------- | ----------- |
| `errorState`        | `string` |             |
| `missingTokenState` | `string` |             |
| `resendButton`      | `string` |             |
| `root`              | `string` |             |
| `verifiedState`     | `string` |             |
| `verifyingState`    | `string` |             |

**copy keys**

| Key                   | Type     | Description |
| --------------------- | -------- | ----------- |
| `description`         | `string` |             |
| `errorPrefix`         | `string` |             |
| `missingTokenMessage` | `string` |             |
| `resend`              | `string` |             |
| `resending`           | `string` |             |
| `resendSuccess`       | `string` |             |
| `title`               | `string` |             |
| `unavailable`         | `string` |             |
| `verified`            | `string` |             |
| `verifying`           | `string` |             |

### `ConvexVerifyTwoFactorForm`

**Props**

| Name                                          | Type                                  | Optional | Description                                                         |
| --------------------------------------------- | ------------------------------------- | -------- | ------------------------------------------------------------------- |
| `authClient`                                  | `ConvexBetterAuthClient \| None`      | Yes      |                                                                     |
| `classNames`                                  | `ConvexVerifyTwoFactorFormClassNames` | Yes      |                                                                     |
| `copy`                                        | `ConvexVerifyTwoFactorFormCopy`       | Yes      |                                                                     |
| `onVerified`                                  | `() => void`                          | Yes      | Fired once the second factor is satisfied and the session is live.  |
| `showTrustDevice`                             | `boolean`                             | Yes      | Show the "trust this device" checkbox (skips 2FA on this device for |
| the server's trust window). Defaults to true. |

**classNames keys**

| Key            | Type     | Description |
| -------------- | -------- | ----------- |
| `errorState`   | `string` |             |
| `field`        | `string` |             |
| `form`         | `string` |             |
| `input`        | `string` |             |
| `label`        | `string` |             |
| `root`         | `string` |             |
| `submitButton` | `string` |             |
| `toggleButton` | `string` |             |
| `trustToggle`  | `string` |             |

**copy keys**

| Key                     | Type     | Description |
| ----------------------- | -------- | ----------- |
| `backupCodeLabel`       | `string` |             |
| `backupCodePlaceholder` | `string` |             |
| `codeLabel`             | `string` |             |
| `codePlaceholder`       | `string` |             |
| `description`           | `string` |             |
| `submit`                | `string` |             |
| `submitting`            | `string` |             |
| `title`                 | `string` |             |
| `trustDeviceLabel`      | `string` |             |
| `unavailable`           | `string` |             |
| `useAuthenticator`      | `string` |             |
| `useBackupCode`         | `string` |             |

## Webhooks

### `ConvexExhaustedWebhookDeliveryList`

**Generics:** `<EventType, EndpointId, DeliveryId, OrganizationId>`

**Props**

### `ConvexWebhookCreateForm`

**Generics:** `<EventType>`

**Props**

| Name                  | Type                                      | Optional | Description |
| --------------------- | ----------------------------------------- | -------- | ----------- |
| `classNames`          | `ConvexWebhookClassNames`                 | Yes      |             |
| `copy`                | `ConvexWebhookCreateFormCopy`             | Yes      |             |
| `creating`            | `boolean`                                 | No       |             |
| `enabled`             | `boolean`                                 | No       |             |
| `eventOptions`        | `readonly EventType[]`                    | No       |             |
| `onDescriptionChange` | `(value: string) => void`                 | No       |             |
| `onEventsChange`      | `(value: EventType[]) => void`            | No       |             |
| `onSubmit`            | `() => void`                              | No       |             |
| `onUrlChange`         | `(value: string) => void`                 | No       |             |
| `state`               | `ConvexWebhookCreateFormState<EventType>` | No       |             |

**classNames keys**

| Key                     | Type     | Description |
| ----------------------- | -------- | ----------- |
| `card`                  | `string` |             |
| `cardContent`           | `string` |             |
| `codeBlock`             | `string` |             |
| `deliveryCard`          | `string` |             |
| `deliveryDetails`       | `string` |             |
| `deliveryFilterGrid`    | `string` |             |
| `deliveryHeader`        | `string` |             |
| `deliveryPanel`         | `string` |             |
| `destructiveButton`     | `string` |             |
| `endpointActions`       | `string` |             |
| `endpointCard`          | `string` |             |
| `endpointFormGrid`      | `string` |             |
| `endpointHeader`        | `string` |             |
| `endpointList`          | `string` |             |
| `endpointMeta`          | `string` |             |
| `exhaustedPanel`        | `string` |             |
| `input`                 | `string` |             |
| `label`                 | `string` |             |
| `labelText`             | `string` |             |
| `pill`                  | `string` |             |
| `pillDisabled`          | `string` |             |
| `pillList`              | `string` |             |
| `pillSelected`          | `string` |             |
| `primaryButton`         | `string` |             |
| `primaryButtonDisabled` | `string` |             |
| `secondaryButton`       | `string` |             |
| `select`                | `string` |             |
| `stateText`             | `string` |             |
| `tag`                   | `string` |             |
| `warningButton`         | `string` |             |

**copy keys**

| Key                      | Type     | Description |
| ------------------------ | -------- | ----------- |
| `createLabel`            | `string` |             |
| `creatingLabel`          | `string` |             |
| `descriptionLabel`       | `string` |             |
| `descriptionPlaceholder` | `string` |             |
| `urlLabel`               | `string` |             |
| `urlPlaceholder`         | `string` |             |

### `ConvexWebhookDeliveryFilters`

**Generics:** `<EventType, EndpointId>`

**Props**

| Name                 | Type                                                                           | Optional | Description |
| -------------------- | ------------------------------------------------------------------------------ | -------- | ----------- |
| `classNames`         | `ConvexWebhookClassNames`                                                      | Yes      |             |
| `copy`               | `Partial<ConvexWebhookDeliveryCopy>`                                           | Yes      |             |
| `endpointId`         | `EndpointId \| all`                                                            | No       |             |
| `endpoints`          | `readonly ConvexWebhookEndpointListItem<EventType, EndpointId>[] \| undefined` | No       |             |
| `eventOptions`       | `readonly EventType[]`                                                         | No       |             |
| `eventType`          | `EventType \| all`                                                             | No       |             |
| `onEndpointIdChange` | `(value: EndpointId \| all) => void`                                           | No       |             |
| `onEventTypeChange`  | `(value: EventType \| all) => void`                                            | No       |             |
| `onStatusChange`     | `(value: ConvexWebhookDeliveryStatus \| all) => void`                          | No       |             |
| `status`             | `ConvexWebhookDeliveryStatus \| all`                                           | No       |             |

**classNames keys**

| Key                     | Type     | Description |
| ----------------------- | -------- | ----------- |
| `card`                  | `string` |             |
| `cardContent`           | `string` |             |
| `codeBlock`             | `string` |             |
| `deliveryCard`          | `string` |             |
| `deliveryDetails`       | `string` |             |
| `deliveryFilterGrid`    | `string` |             |
| `deliveryHeader`        | `string` |             |
| `deliveryPanel`         | `string` |             |
| `destructiveButton`     | `string` |             |
| `endpointActions`       | `string` |             |
| `endpointCard`          | `string` |             |
| `endpointFormGrid`      | `string` |             |
| `endpointHeader`        | `string` |             |
| `endpointList`          | `string` |             |
| `endpointMeta`          | `string` |             |
| `exhaustedPanel`        | `string` |             |
| `input`                 | `string` |             |
| `label`                 | `string` |             |
| `labelText`             | `string` |             |
| `pill`                  | `string` |             |
| `pillDisabled`          | `string` |             |
| `pillList`              | `string` |             |
| `pillSelected`          | `string` |             |
| `primaryButton`         | `string` |             |
| `primaryButtonDisabled` | `string` |             |
| `secondaryButton`       | `string` |             |
| `select`                | `string` |             |
| `stateText`             | `string` |             |
| `tag`                   | `string` |             |
| `warningButton`         | `string` |             |

### `ConvexWebhookDeliveryList`

**Generics:** `<EventType, EndpointId, DeliveryId, OrganizationId>`

**Props**

| Name                 | Type                                                                                                       | Optional | Description |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| `classNames`         | `ConvexWebhookClassNames`                                                                                  | Yes      |             |
| `copy`               | `ConvexWebhookDeliveryCopy`                                                                                | No       |             |
| `deliveries`         | `readonly ConvexWebhookDeliveryListItem<EventType, EndpointId, DeliveryId, OrganizationId>[] \| undefined` | No       |             |
| `formatTimestamp`    | `(timestamp: number) => string`                                                                            | Yes      |             |
| `renderFailureBadge` | `(failureKind: ConvexWebhookDeliveryFailureKind) => ReactNode`                                             | Yes      |             |
| `renderTag`          | `(label: string) => ReactNode`                                                                             | Yes      |             |

**classNames keys**

| Key                     | Type     | Description |
| ----------------------- | -------- | ----------- |
| `card`                  | `string` |             |
| `cardContent`           | `string` |             |
| `codeBlock`             | `string` |             |
| `deliveryCard`          | `string` |             |
| `deliveryDetails`       | `string` |             |
| `deliveryFilterGrid`    | `string` |             |
| `deliveryHeader`        | `string` |             |
| `deliveryPanel`         | `string` |             |
| `destructiveButton`     | `string` |             |
| `endpointActions`       | `string` |             |
| `endpointCard`          | `string` |             |
| `endpointFormGrid`      | `string` |             |
| `endpointHeader`        | `string` |             |
| `endpointList`          | `string` |             |
| `endpointMeta`          | `string` |             |
| `exhaustedPanel`        | `string` |             |
| `input`                 | `string` |             |
| `label`                 | `string` |             |
| `labelText`             | `string` |             |
| `pill`                  | `string` |             |
| `pillDisabled`          | `string` |             |
| `pillList`              | `string` |             |
| `pillSelected`          | `string` |             |
| `primaryButton`         | `string` |             |
| `primaryButtonDisabled` | `string` |             |
| `secondaryButton`       | `string` |             |
| `select`                | `string` |             |
| `stateText`             | `string` |             |
| `tag`                   | `string` |             |
| `warningButton`         | `string` |             |

**copy keys**

| Key                       | Type     | Description |
| ------------------------- | -------- | ----------- |
| `allEndpointsLabel`       | `string` |             |
| `allEventTypesLabel`      | `string` |             |
| `allStatusesLabel`        | `string` |             |
| `createdLabel`            | `string` |             |
| `emptyMessage`            | `string` |             |
| `endpointFilterLabel`     | `string` |             |
| `eventFilterLabel`        | `string` |             |
| `eventIdLabel`            | `string` |             |
| `exhaustedDescription`    | `string` |             |
| `exhaustedLabel`          | `string` |             |
| `exhaustedLoadingMessage` | `string` |             |
| `exhaustedTitle`          | `string` |             |
| `failureKindLabel`        | `string` |             |
| `historyDescription`      | `string` |             |
| `historyTitle`            | `string` |             |
| `loadingMessage`          | `string` |             |
| `nextLabel`               | `string` |             |
| `ofLabel`                 | `string` |             |
| `previousLabel`           | `string` |             |
| `recoveredLabel`          | `string` |             |
| `responseLabel`           | `string` |             |
| `retryDueLabel`           | `string` |             |
| `retryingLabel`           | `string` |             |
| `retryLabel`              | `string` |             |
| `showingLabel`            | `string` |             |
| `statusFilterLabel`       | `string` |             |

### `ConvexWebhookDeliveryPagination`

**Generics:** `<EventType, EndpointId, DeliveryId, OrganizationId>`

**Props**

| Name         | Type                                                                                        | Optional | Description |
| ------------ | ------------------------------------------------------------------------------------------- | -------- | ----------- |
| `classNames` | `ConvexWebhookClassNames`                                                                   | Yes      |             |
| `copy`       | `Partial<ConvexWebhookDeliveryCopy>`                                                        | Yes      |             |
| `onNext`     | `() => void`                                                                                | No       |             |
| `onPrevious` | `() => void`                                                                                | No       |             |
| `page`       | `ConvexWebhookDeliveryPage<EventType, EndpointId, DeliveryId, OrganizationId> \| undefined` | No       |             |

**classNames keys**

| Key                     | Type     | Description |
| ----------------------- | -------- | ----------- |
| `card`                  | `string` |             |
| `cardContent`           | `string` |             |
| `codeBlock`             | `string` |             |
| `deliveryCard`          | `string` |             |
| `deliveryDetails`       | `string` |             |
| `deliveryFilterGrid`    | `string` |             |
| `deliveryHeader`        | `string` |             |
| `deliveryPanel`         | `string` |             |
| `destructiveButton`     | `string` |             |
| `endpointActions`       | `string` |             |
| `endpointCard`          | `string` |             |
| `endpointFormGrid`      | `string` |             |
| `endpointHeader`        | `string` |             |
| `endpointList`          | `string` |             |
| `endpointMeta`          | `string` |             |
| `exhaustedPanel`        | `string` |             |
| `input`                 | `string` |             |
| `label`                 | `string` |             |
| `labelText`             | `string` |             |
| `pill`                  | `string` |             |
| `pillDisabled`          | `string` |             |
| `pillList`              | `string` |             |
| `pillSelected`          | `string` |             |
| `primaryButton`         | `string` |             |
| `primaryButtonDisabled` | `string` |             |
| `secondaryButton`       | `string` |             |
| `select`                | `string` |             |
| `stateText`             | `string` |             |
| `tag`                   | `string` |             |
| `warningButton`         | `string` |             |

### `ConvexWebhookEndpointList`

**Generics:** `<EventType, EndpointId>`

**Props**

| Name                    | Type                                                                           | Optional | Description |
| ----------------------- | ------------------------------------------------------------------------------ | -------- | ----------- |
| `classNames`            | `ConvexWebhookClassNames`                                                      | Yes      |             |
| `copy`                  | `ConvexWebhookEndpointListCopy`                                                | No       |             |
| `endpoints`             | `readonly ConvexWebhookEndpointListItem<EventType, EndpointId>[] \| undefined` | No       |             |
| `eventOptions`          | `readonly EventType[]`                                                         | No       |             |
| `onArchive`             | `(endpointId: EndpointId) => void`                                             | No       |             |
| `onDelete`              | `(endpointId: EndpointId) => void`                                             | No       |             |
| `onDisable`             | `(endpointId: EndpointId) => void`                                             | No       |             |
| `onRotateSecret`        | `(endpointId: EndpointId) => void`                                             | No       |             |
| `onSave`                | `(endpointId: EndpointId, values: __type) => void`                             | No       |             |
| `onSendTest`            | `(endpointId: EndpointId) => void`                                             | No       |             |
| `renderTag`             | `(label: string) => ReactNode`                                                 | Yes      |             |
| `sendingTestEndpointId` | `EndpointId \| None`                                                           | No       |             |

**classNames keys**

| Key                     | Type     | Description |
| ----------------------- | -------- | ----------- |
| `card`                  | `string` |             |
| `cardContent`           | `string` |             |
| `codeBlock`             | `string` |             |
| `deliveryCard`          | `string` |             |
| `deliveryDetails`       | `string` |             |
| `deliveryFilterGrid`    | `string` |             |
| `deliveryHeader`        | `string` |             |
| `deliveryPanel`         | `string` |             |
| `destructiveButton`     | `string` |             |
| `endpointActions`       | `string` |             |
| `endpointCard`          | `string` |             |
| `endpointFormGrid`      | `string` |             |
| `endpointHeader`        | `string` |             |
| `endpointList`          | `string` |             |
| `endpointMeta`          | `string` |             |
| `exhaustedPanel`        | `string` |             |
| `input`                 | `string` |             |
| `label`                 | `string` |             |
| `labelText`             | `string` |             |
| `pill`                  | `string` |             |
| `pillDisabled`          | `string` |             |
| `pillList`              | `string` |             |
| `pillSelected`          | `string` |             |
| `primaryButton`         | `string` |             |
| `primaryButtonDisabled` | `string` |             |
| `secondaryButton`       | `string` |             |
| `select`                | `string` |             |
| `stateText`             | `string` |             |
| `tag`                   | `string` |             |
| `warningButton`         | `string` |             |

**copy keys**

| Key                 | Type     | Description |
| ------------------- | -------- | ----------- |
| `allEventsLabel`    | `string` |             |
| `archiveLabel`      | `string` |             |
| `deleteLabel`       | `string` |             |
| `descriptionLabel`  | `string` |             |
| `disableLabel`      | `string` |             |
| `emptyMessage`      | `string` |             |
| `endpointUrlLabel`  | `string` |             |
| `loadingMessage`    | `string` |             |
| `rotateSecretLabel` | `string` |             |
| `saveLabel`         | `string` |             |
| `secretLabel`       | `string` |             |
| `sendingTestLabel`  | `string` |             |
| `sendTestLabel`     | `string` |             |

### `ConvexWebhookSettingsSurface`

**Generics:** `<EventType, EndpointId, DeliveryId, OrganizationId>`

**Props**

| Name                       | Type                                                                                         | Optional | Description |
| -------------------------- | -------------------------------------------------------------------------------------------- | -------- | ----------- |
| `captureEvent`             | `(name: string, properties: Record<string, unknown>) => void`                                | Yes      |             |
| `classNames`               | `ConvexWebhookClassNames`                                                                    | Yes      |             |
| `confirmDeleteEndpoint`    | `(args: __type) => boolean \| Promise<boolean>`                                              | Yes      |             |
| `copy`                     | `ConvexWebhookSettingsSurfaceCopy`                                                           | Yes      |             |
| `createRequestId`          | `(prefix: string) => string`                                                                 | No       |             |
| `deliveryLimit`            | `number`                                                                                     | Yes      |             |
| `enabled`                  | `boolean`                                                                                    | No       |             |
| `eventOptions`             | `readonly EventType[]`                                                                       | No       |             |
| `exhaustedDeliveryLimit`   | `number`                                                                                     | Yes      |             |
| `formatTimestamp`          | `(timestamp: number) => string`                                                              | Yes      |             |
| `getErrorMessage`          | `(error: unknown, fallback: string) => string`                                               | Yes      |             |
| `organizationId`           | `string`                                                                                     | Yes      |             |
| `refs`                     | `ConvexWebhookSettingsFunctionReferences<EventType, EndpointId, DeliveryId, OrganizationId>` | No       |             |
| `renderActionError`        | `(message: string) => ReactNode`                                                             | Yes      |             |
| `renderFailureBadge`       | `(failureKind: ConvexWebhookDeliveryFailureKind) => ReactNode`                               | Yes      |             |
| `renderProcessQueueButton` | `(args: __type) => ReactNode`                                                                | Yes      |             |
| `renderSecret`             | `(args: __type) => ReactNode`                                                                | Yes      |             |
| `renderTag`                | `(label: string) => ReactNode`                                                               | Yes      |             |

**classNames keys**

| Key                     | Type     | Description |
| ----------------------- | -------- | ----------- |
| `card`                  | `string` |             |
| `cardContent`           | `string` |             |
| `codeBlock`             | `string` |             |
| `deliveryCard`          | `string` |             |
| `deliveryDetails`       | `string` |             |
| `deliveryFilterGrid`    | `string` |             |
| `deliveryHeader`        | `string` |             |
| `deliveryPanel`         | `string` |             |
| `destructiveButton`     | `string` |             |
| `endpointActions`       | `string` |             |
| `endpointCard`          | `string` |             |
| `endpointFormGrid`      | `string` |             |
| `endpointHeader`        | `string` |             |
| `endpointList`          | `string` |             |
| `endpointMeta`          | `string` |             |
| `exhaustedPanel`        | `string` |             |
| `input`                 | `string` |             |
| `label`                 | `string` |             |
| `labelText`             | `string` |             |
| `pill`                  | `string` |             |
| `pillDisabled`          | `string` |             |
| `pillList`              | `string` |             |
| `pillSelected`          | `string` |             |
| `primaryButton`         | `string` |             |
| `primaryButtonDisabled` | `string` |             |
| `secondaryButton`       | `string` |             |
| `select`                | `string` |             |
| `stateText`             | `string` |             |
| `tag`                   | `string` |             |
| `warningButton`         | `string` |             |

**copy keys**

| Key                   | Type                                     | Description |
| --------------------- | ---------------------------------------- | ----------- |
| `actionErrorTitle`    | `string`                                 |             |
| `create`              | `ConvexWebhookCreateFormCopy`            |             |
| `deliveries`          | `Partial<ConvexWebhookDeliveryCopy>`     |             |
| `endpoints`           | `Partial<ConvexWebhookEndpointListCopy>` |             |
| `exhaustedDeliveries` | `Partial<ConvexWebhookDeliveryCopy>`     |             |
| `processQueueLabel`   | `string`                                 |             |
| `secretTitle`         | `string`                                 |             |
