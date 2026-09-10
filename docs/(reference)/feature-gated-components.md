# Feature-gated `convexAuth` components

The `convex-auth` package ships the auth tables as independently mountable Convex components. A consumer can install only the features they need, instead of the monolithic full component that includes organizations, API keys, agent auth, auth metadata, webhooks, and MCP OAuth tables.

## Available components

| Subpath                                       | Component                     | Tables                                                                                                                |
| --------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `convex-auth/convex.config`                   | `convexAuth` (full)           | All auth tables. Backward-compatible with the original single-component setup.                                        |
| `convex-auth/convex.config/core`              | `convexAuthCore`              | Users, identities, sessions, refresh tokens, verification codes, verifiers, rate limits, magic-link tokens, accounts. |
| `convex-auth/convex.config/organizations`     | `convexAuthOrganizations`     | Core tables + organizations, roles, members, invitations.                                                             |
| `convex-auth/convex.config/servicePrincipals` | `convexAuthServicePrincipals` | Users, organizations, service principals.                                                                             |
| `convex-auth/convex.config/apiKeys`           | `convexAuthApiKeys`           | Users, organizations, service principals, API keys, auth audit events.                                                |
| `convex-auth/convex.config/agentAuth`         | `convexAuthAgentAuth`         | Users, organizations, agent auth tables.                                                                              |
| `convex-auth/convex.config/authMd`            | `convexAuthAuthMd`            | Users, organizations, auth metadata tables.                                                                           |
| `convex-auth/convex.config/webhooks`          | `convexAuthWebhooks`          | Users, organizations, webhook endpoints and deliveries.                                                               |
| `convex-auth/convex.config/mcpOauth`          | `convexAuthMcpOauth`          | MCP OAuth clients, codes, signing keys, refresh tokens, revoked families.                                             |

Every add-on component includes its own prerequisite tables and is self-contained. You can `app.use()` each one independently.

## Minimal core-only setup

```ts
import { defineApp } from "convex/server";
import { v } from "convex/values";
import authCore from "@vortex-api/convex-auth/convex.config/core";

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

In `convex/auth.ts`:

```ts
import { components } from "./_generated/api";
import { convexAuth } from "@vortex-api/convex-auth/convex";

export const auth = convexAuth({
  components: { core: components.convexAuthCore },
});
```

## Core + organizations + API keys

```ts
import { defineApp } from "convex/server";
import { v } from "convex/values";
import authCore from "@vortex-api/convex-auth/convex.config/core";
import authOrganizations from "@vortex-api/convex-auth/convex.config/organizations";
import authApiKeys from "@vortex-api/convex-auth/convex.config/apiKeys";

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

app.use(authOrganizations, {
  env: {
    JWT_PRIVATE_KEY: app.env.JWT_PRIVATE_KEY,
    JWKS: app.env.JWKS,
  },
});

app.use(authApiKeys);

export default app;
```

## Add-on features without operation helpers

The add-on components (`servicePrincipals`, `agentAuth`, `authMd`, `webhooks`, `mcpOauth`) are exposed through their generated `ComponentApi` handles. Consumers mount the component and call its functions directly with `ctx.runQuery` / `ctx.runMutation`.

## Runtime `components` bag for organization operations

If you use `createConvexAuthOrganizationOperations`, pass a `components` object instead of the legacy single `component` handle:

```ts
import { createConvexAuthOrganizationOperations } from "@vortex-api/convex-auth/convex";

const ops = createConvexAuthOrganizationOperations({
  components: {
    core: { identity: { getByIdentity: components.convexAuthCore.identity.getByIdentity } },
    organizations: components.convexAuthOrganizations.organizations,
    apiKeys: components.convexAuthApiKeys.apiKeys,
  },
  // ... bridge adapters
});
```
