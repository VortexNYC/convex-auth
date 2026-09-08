---
title: Migrating from the full `convexAuth` component
description: "Optional migration to feature-gated convex-auth components."
---

# Migrating from the full `convexAuth` component

The full `convex-auth/convex.config` component still works and is the safest starting point for existing consumers. Migration to feature-gated components is optional and driven by which auth features you actually use.

## When to migrate

- **Core only:** If your app only needs email/password, magic links, email OTP, OAuth, sessions, and user/identity tables, use `convex-auth/convex.config/core`.
- **Core + organizations:** If you need organizations, members, roles, and invitations, add `convex-auth/convex.config/organizations`.
- **Core + organizations + API keys:** If you also need machine API keys and audit events, add `convex-auth/convex.config/apiKeys`.
- **Other add-ons:** Mount `servicePrincipals`, `agentAuth`, `authMd`, `webhooks`, or `mcpOauth` only when you use those features.

## Migration steps

1. Keep your current `convex/convex.config.ts` with the full component until the split setup is verified.
2. Create a new `convex/convex.config.ts` that imports only the components you need:

   ```ts
   import { defineApp } from "convex/server";
   import { v } from "convex/values";
   import authCore from "convex-auth/convex.config/core";

   const app = defineApp({
     env: {
       JWT_PRIVATE_KEY: v.string(),
       JWKS: v.string(),
     },
   });

   app.use(authCore, {
     env: {
       JWT_PRIVATE_KEY: app.env.JWT_PRIVATE_KEY,
       JWKS: app.env.JWKS,
     },
   });

   export default app;
   ```

3. Update `convex/auth.ts` to use the split `components` API:

   ```ts
   import { components } from "./_generated/api";
   import { convexAuth } from "convex-auth/convex";

   export const auth = convexAuth({
     components: { core: components.convexAuthCore },
     // ... emailAndPassword, oauth, etc.
   });
   ```

4. Run `npx convex dev` or `npx convex deploy` to regenerate bindings and push the new schema.
5. Run your full local proof (`pnpm run typecheck`, `pnpm run build`, `pnpm test`).

## What happens to old tables?

Convex does not drop tables when they are removed from the active schema. Data in tables from the full component (e.g. `organizations`, `api_keys`) remains in the database but is no longer referenced by the active component. You can delete unused data through the Convex dashboard or run a migration if you are sure the feature is no longer needed.

## Rollback

If you need to return to the full component, restore the original `convex.config.ts` and `auth.ts`, then run `npx convex dev` again. The full component will remount and expose the same `components.convexAuth` handle.
