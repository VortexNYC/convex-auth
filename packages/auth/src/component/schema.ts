import { defineSchema } from "convex/server";
import {
  auth_md_assertions,
  auth_md_audit_events,
  auth_md_credentials,
  auth_md_registrations,
} from "./schema/authMd.js";
import { auth_identities, users } from "./schema/users.js";
import { auth_passkeys, auth_passkey_challenges } from "./schema/passkeys.js";
import {
  organization_invitations,
  organization_members,
  organization_roles,
  organizations,
} from "./schema/organizations.js";
import {
  agent_auth_audit_events,
  agent_capability_grants,
  agent_device_authorization_attempts,
  agent_device_authorizations,
  agent_host_keys,
  agent_host_replay_records,
  agent_hosts,
  agent_keys,
  agent_replay_records,
  agents,
} from "./schema/agents.js";
import { auth_audit_events, api_keys } from "./schema/apiKeys.js";
import {
  mcp_oauth_authorization_codes,
  mcp_oauth_clients,
  mcp_oauth_refresh_tokens,
  mcp_oauth_revoked_families,
  mcp_oauth_signing_keys,
} from "./schema/mcp.js";
import {
  authAccounts,
  authMagicLinkTokens,
  authRefreshTokens,
  authSessions,
  authVerificationCodes,
  authVerifiers,
} from "./schema/native.js";
import { service_principals } from "./schema/servicePrincipals.js";
import { webhook_deliveries, webhook_endpoints } from "./schema/webhooks.js";

export * from "./schema/validators.js";

export default defineSchema({
  users,
  auth_identities,

  organizations,
  organization_roles,
  organization_members,
  organization_invitations,

  service_principals,

  agent_hosts,
  agent_host_keys,
  agents,
  agent_keys,
  agent_capability_grants,
  agent_replay_records,
  agent_host_replay_records,
  agent_device_authorizations,
  agent_device_authorization_attempts,
  agent_auth_audit_events,

  auth_md_registrations,
  auth_md_assertions,
  auth_md_credentials,
  auth_md_audit_events,

  api_keys,
  auth_audit_events,

  webhook_endpoints,
  webhook_deliveries,

  mcp_oauth_authorization_codes,
  mcp_oauth_signing_keys,
  mcp_oauth_clients,

  authAccounts,
  authSessions,
  authRefreshTokens,
  mcp_oauth_refresh_tokens,
  mcp_oauth_revoked_families,
  authVerificationCodes,
  authVerifiers,
  authMagicLinkTokens,

  auth_passkeys,
  auth_passkey_challenges,
});
