import { describe, expect, it } from "vitest";

import coreSchema from "./core/schema.js";
import organizationsSchema from "./organizations/schema.js";
import servicePrincipalsSchema from "./servicePrincipals/schema.js";
import apiKeysSchema from "./apiKeys/schema.js";
import agentAuthSchema from "./agentAuth/schema.js";
import authMdSchema from "./authMd/schema.js";
import webhooksSchema from "./webhooks/schema.js";
import mcpOauthSchema from "./mcpOauth/schema.js";

function tableNames(schema: { tables: Record<string, unknown> }): string[] {
  return Object.keys(schema.tables);
}

describe("feature-gated component schemas", () => {
  it("core includes native auth, user, and organization tables", () => {
    const tables = tableNames(coreSchema);
    expect(tables).toEqual([
      "users",
      "auth_identities",
      "authAccounts",
      "authSessions",
      "authRefreshTokens",
      "authVerificationCodes",
      "authVerifiers",
      "authMagicLinkTokens",
      "organizations",
    ]);
  });

  it("organizations adds org tables but no feature add-on tables", () => {
    const tables = tableNames(organizationsSchema);
    expect(tables).toContain("organizations");
    expect(tables).toContain("organization_roles");
    expect(tables).toContain("organization_members");
    expect(tables).toContain("organization_invitations");
    expect(tables).not.toContain("api_keys");
    expect(tables).not.toContain("service_principals");
    expect(tables).not.toContain("agent_hosts");
    expect(tables).not.toContain("auth_md_registrations");
    expect(tables).not.toContain("webhook_endpoints");
    expect(tables).not.toContain("mcp_oauth_clients");
  });

  it("servicePrincipals includes only service_principals plus prerequisites", () => {
    const tables = tableNames(servicePrincipalsSchema);
    expect(tables).toContain("users");
    expect(tables).toContain("organizations");
    expect(tables).toContain("service_principals");
    expect(tables).not.toContain("api_keys");
  });

  it("apiKeys includes api_keys and service_principals plus prerequisites", () => {
    const tables = tableNames(apiKeysSchema);
    expect(tables).toContain("users");
    expect(tables).toContain("organizations");
    expect(tables).toContain("service_principals");
    expect(tables).toContain("api_keys");
    expect(tables).toContain("auth_audit_events");
    expect(tables).not.toContain("organization_invitations");
    expect(tables).not.toContain("agent_hosts");
  });

  it("agentAuth includes only agent tables plus prerequisites", () => {
    const tables = tableNames(agentAuthSchema);
    expect(tables).toContain("users");
    expect(tables).toContain("organizations");
    expect(tables).toContain("agent_hosts");
    expect(tables).toContain("agent_capability_grants");
    expect(tables).not.toContain("api_keys");
    expect(tables).not.toContain("auth_md_registrations");
  });

  it("authMd includes only auth_md tables plus prerequisites", () => {
    const tables = tableNames(authMdSchema);
    expect(tables).toContain("users");
    expect(tables).toContain("organizations");
    expect(tables).toContain("auth_md_registrations");
    expect(tables).toContain("auth_md_assertions");
    expect(tables).toContain("auth_md_credentials");
    expect(tables).toContain("auth_md_audit_events");
    expect(tables).not.toContain("api_keys");
    expect(tables).not.toContain("webhook_endpoints");
  });

  it("webhooks includes only webhook tables plus prerequisites", () => {
    const tables = tableNames(webhooksSchema);
    expect(tables).toContain("users");
    expect(tables).toContain("organizations");
    expect(tables).toContain("webhook_endpoints");
    expect(tables).toContain("webhook_deliveries");
    expect(tables).not.toContain("api_keys");
    expect(tables).not.toContain("auth_md_registrations");
  });

  it("mcpOauth includes only mcp_oauth tables and no user/org tables", () => {
    const tables = tableNames(mcpOauthSchema);
    expect(tables).toEqual([
      "mcp_oauth_authorization_codes",
      "mcp_oauth_signing_keys",
      "mcp_oauth_clients",
      "mcp_oauth_refresh_tokens",
      "mcp_oauth_revoked_families",
    ]);
  });
});
