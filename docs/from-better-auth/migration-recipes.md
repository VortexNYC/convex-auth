---
title: Migration recipes
description: "Before/after patterns for moving each supported Better Auth plugin to convex-auth."
---

# Migration recipes

Each section shows the Better Auth plugin pattern and the `convex-auth` equivalent. These assume the one-time data migration has already run and the `convexAuth` component is mounted.

## Email and password

### Before

```ts
import { betterAuth } from "better-auth";

betterAuth({
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
});
```

```tsx
await authClient.signIn.email({ email, password });
await authClient.signUp.email({ email, password, name });
```

### After

```ts
import { convexAuth } from "convex-auth/convex";

export const { auth, emailAndPassword } = convexAuth(components.convexAuth, {
  emailAndPassword: {
    enabled: true,
    requireVerifiedEmail: false,
    email: { sender: sendVerificationEmail, path: "/verify" },
  },
});
```

```tsx
import { useAuthActions } from "convex-auth/react";

const { signIn, signUp } = useAuthActions();

await signIn.email({ email, password });
await signUp.email({ email, password, name });
```

## OAuth

### Before

```ts
import { betterAuth } from "better-auth";

betterAuth({
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
});
```

```tsx
await authClient.signIn.social({ provider: "google", callbackURL: "/" });
```

### After

```ts
import { convexAuth } from "convex-auth/convex";

export const { auth, oauth } = convexAuth(components.convexAuth, {
  oauth: {
    enabled: true,
    providers: [
      {
        id: "google",
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
    ],
  },
});
```

```tsx
import { useAuthActions } from "convex-auth/react";

const { signInWithRedirect } = useAuthActions();
await signInWithRedirect({ provider: "google", callbackURL: window.location.href });
```

## Two-factor authentication

### Before

```ts
import { twoFactor } from "better-auth/plugins";

betterAuth({
  plugins: [twoFactor()],
});
```

```tsx
await authClient.twoFactor.enable({ password });
await authClient.signIn.email({ email, password, twoFactor: { totp: code } });
```

### After

Two-factor is built into `convex-auth` and configured on the identity.

```tsx
import { useAuthActions } from "convex-auth/react";

const { twoFactor } = useAuthActions();

await twoFactor.enrollTOTP({ password });
await signIn.email({ email, password, twoFactor: { totp: code } });
```

## Organizations

### Before

```ts
import { organization } from "better-auth/plugins";

betterAuth({
  plugins: [organization()],
});
```

```tsx
await authClient.organization.create({ name: "Acme" });
await authClient.organization.setActive({ organizationId: org.id });
```

### After

Mount the `convex-auth` organizations feature in `convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import convexAuth from "convex-auth/convex.config";
import convexAuthOrganizations from "convex-auth/convex.config/organizations";

const app = defineApp();
app.use(convexAuth);
app.use(convexAuthOrganizations);
export default app;
```

Client side uses the same `useAuthActions` surface:

```tsx
const { organizations } = useAuthActions();
await organizations.create({ name: "Acme" });
await organizations.setActive({ organizationId: org.id });
```

## API keys

### Before

```ts
import { apiKey } from "better-auth/plugins";

betterAuth({
  plugins: [apiKey()],
});
```

```tsx
await authClient.apiKey.create({ name: "CI" });
```

### After

Mount the API keys feature in `convex/convex.config.ts`:

```ts
import convexAuthApiKeys from "convex-auth/convex.config/apiKeys";
app.use(convexAuthApiKeys);
```

```tsx
const { apiKeys } = useAuthActions();
const key = await apiKeys.create({ name: "CI" });
```

## Magic links

### Before

```ts
import { magicLink } from "better-auth/plugins";

betterAuth({
  plugins: [magicLink({ sendMagicLink: send })],
});
```

```tsx
await authClient.signIn.magicLink({ email, callbackURL: "/" });
```

### After

Configure `emailAndPassword` with a `magicLink` sender:

```ts
import { convexAuth } from "convex-auth/convex";

export const { auth } = convexAuth(components.convexAuth, {
  emailAndPassword: {
    enabled: true,
    magicLink: { sender: sendMagicLink, path: "/magic-link" },
  },
});
```

```tsx
const { signIn } = useAuthActions();
await signIn.magicLink({ email, callbackURL: window.location.href });
```

## Email OTP

### Before

```ts
import { emailOTP } from "better-auth/plugins";

betterAuth({
  plugins: [emailOTP({ sendVerificationOTP: send })],
});
```

```tsx
await authClient.emailOtp.sendVerificationOtp({ email });
await authClient.signIn.emailOtp({ email, otp });
```

### After

```ts
import { emailOtp } from "convex-auth/convex";

export const { auth } = convexAuth(components.convexAuth, {
  emailAndPassword: {
    enabled: true,
    emailOtp: { sender: sendEmailOtp },
  },
});
```

```tsx
const { signIn } = useAuthActions();
await signIn.emailOtp({ email });
await signIn.emailOtp({ email, otp });
```

## Webhooks

### Before

```ts
import { webhooks } from "better-auth/plugins";

betterAuth({
  plugins: [webhooks({})],
});
```

### After

Mount the webhooks feature in `convex/convex.config.ts`:

```ts
import convexAuthWebhooks from "convex-auth/convex.config/webhooks";
app.use(convexAuthWebhooks);
```

Then subscribe to events:

```tsx
const { webhooks } = useAuthActions();
await webhooks.createEndpoint({
  url: "https://example.com/webhook",
  events: ["organizationMemberJoined"],
});
```
