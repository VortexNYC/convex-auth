/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentAuth from "../agentAuth.js";
import type * as apiKeys from "../apiKeys.js";
import type * as authMd from "../authMd.js";
import type * as convex_src_machine_apiKeySecret from "../convex/src/machine/apiKeySecret.js";
import type * as identity from "../identity.js";
import type * as mcp from "../mcp.js";
import type * as migrate from "../migrate.js";
import type * as native_accounts from "../native/accounts.js";
import type * as native_audit from "../native/audit.js";
import type * as native_codes from "../native/codes.js";
import type * as native_identities from "../native/identities.js";
import type * as native_rateLimits from "../native/rateLimits.js";
import type * as native_refreshTokens from "../native/refreshTokens.js";
import type * as native_sessions from "../native/sessions.js";
import type * as native_users from "../native/users.js";
import type * as native_verifiers from "../native/verifiers.js";
import type * as organizations from "../organizations.js";
import type * as passkeys from "../passkeys.js";
import type * as schema_agents from "../schema/agents.js";
import type * as schema_apiKeys from "../schema/apiKeys.js";
import type * as schema_authMd from "../schema/authMd.js";
import type * as schema_mcp from "../schema/mcp.js";
import type * as schema_native from "../schema/native.js";
import type * as schema_organizations from "../schema/organizations.js";
import type * as schema_passkeys from "../schema/passkeys.js";
import type * as schema_servicePrincipals from "../schema/servicePrincipals.js";
import type * as schema_users from "../schema/users.js";
import type * as schema_validators from "../schema/validators.js";
import type * as schema_webhooks from "../schema/webhooks.js";
import type * as scopes from "../scopes.js";
import type * as servicePrincipals from "../servicePrincipals.js";
import type * as status from "../status.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  agentAuth: typeof agentAuth;
  apiKeys: typeof apiKeys;
  authMd: typeof authMd;
  "convex/src/machine/apiKeySecret": typeof convex_src_machine_apiKeySecret;
  identity: typeof identity;
  mcp: typeof mcp;
  migrate: typeof migrate;
  "native/accounts": typeof native_accounts;
  "native/audit": typeof native_audit;
  "native/codes": typeof native_codes;
  "native/identities": typeof native_identities;
  "native/rateLimits": typeof native_rateLimits;
  "native/refreshTokens": typeof native_refreshTokens;
  "native/sessions": typeof native_sessions;
  "native/users": typeof native_users;
  "native/verifiers": typeof native_verifiers;
  organizations: typeof organizations;
  passkeys: typeof passkeys;
  "schema/agents": typeof schema_agents;
  "schema/apiKeys": typeof schema_apiKeys;
  "schema/authMd": typeof schema_authMd;
  "schema/mcp": typeof schema_mcp;
  "schema/native": typeof schema_native;
  "schema/organizations": typeof schema_organizations;
  "schema/passkeys": typeof schema_passkeys;
  "schema/servicePrincipals": typeof schema_servicePrincipals;
  "schema/users": typeof schema_users;
  "schema/validators": typeof schema_validators;
  "schema/webhooks": typeof schema_webhooks;
  scopes: typeof scopes;
  servicePrincipals: typeof servicePrincipals;
  status: typeof status;
  webhooks: typeof webhooks;
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
> = anyApi as any;

export const components = componentsGeneric() as unknown as {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  mcp: import("@vortex-api/convex-auth/_generated/component.js").ComponentApi<"mcp">;
};
