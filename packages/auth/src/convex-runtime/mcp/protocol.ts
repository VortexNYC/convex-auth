import type {
  McpOAuthProtocolConfig,
  OAuthAuthorizationServerMetadata,
  OAuthProtectedResourceMetadata,
} from "./types";

const DEFAULT_RESPONSE_TYPES = ["code"] as const;
const DEFAULT_GRANT_TYPES = ["authorization_code", "refresh_token"] as const;
const DEFAULT_TOKEN_ENDPOINT_AUTH_METHODS = ["none"] as const;
const DEFAULT_CODE_CHALLENGE_METHODS = ["S256"] as const;
const DEFAULT_BEARER_METHODS = ["header"] as const;
const DEFAULT_MCP_PATH = "/mcp";
const DEFAULT_OAUTH_BASE_PATH = "/oauth";

export function createMcpOAuthProtocolConfig(
  config: McpOAuthProtocolConfig,
): Required<McpOAuthProtocolConfig> {
  const resourceSlug = config.resourceSlug.trim();
  const resourceId = config.resourceId.trim();
  const audience = config.audience.trim();
  const oauthBasePath = trimTrailingSlash(config.oauthBasePath ?? DEFAULT_OAUTH_BASE_PATH);
  const issuerPath = config.issuerPath ?? `${oauthBasePath}/${resourceSlug}`;

  return {
    resourceSlug,
    resourceId,
    audience,
    scopesSupported: uniqueStrings(config.scopesSupported),
    mcpPath: config.mcpPath ?? DEFAULT_MCP_PATH,
    oauthBasePath,
    issuerPath,
    responseTypesSupported: config.responseTypesSupported ?? DEFAULT_RESPONSE_TYPES,
    grantTypesSupported: config.grantTypesSupported ?? DEFAULT_GRANT_TYPES,
    tokenEndpointAuthMethodsSupported:
      config.tokenEndpointAuthMethodsSupported ?? DEFAULT_TOKEN_ENDPOINT_AUTH_METHODS,
    codeChallengeMethodsSupported:
      config.codeChallengeMethodsSupported ?? DEFAULT_CODE_CHALLENGE_METHODS,
    bearerMethodsSupported: config.bearerMethodsSupported ?? DEFAULT_BEARER_METHODS,
    clientIdMetadataDocumentSupported: config.clientIdMetadataDocumentSupported ?? false,
  };
}

export function buildMcpOAuthPaths(config: McpOAuthProtocolConfig) {
  const resolved = createMcpOAuthProtocolConfig(config);
  return {
    issuerPath: resolved.issuerPath,
    mcpPath: resolved.mcpPath,
    authorizationServerMetadataPath: `/.well-known/oauth-authorization-server/${resolved.resourceSlug}`,
    protectedResourceMetadataPath: `/.well-known/oauth-protected-resource/${resolved.resourceSlug}`,
    jwksPath: `${resolved.oauthBasePath}/${resolved.resourceSlug}/jwks`,
    authorizePath: `${resolved.oauthBasePath}/${resolved.resourceSlug}/authorize`,
    tokenPath: `${resolved.oauthBasePath}/${resolved.resourceSlug}/token`,
    registrationPath: `${resolved.oauthBasePath}/${resolved.resourceSlug}/register`,
  };
}

export function buildMcpOAuthIssuer(origin: string, config: McpOAuthProtocolConfig): string {
  const { issuerPath } = buildMcpOAuthPaths(config);
  return `${trimTrailingSlash(origin)}${issuerPath}`;
}

/**
 * RFC 8414 authorization-server metadata.
 *
 * `client_id_metadata_document_supported` implements CIMD
 * (draft-ietf-oauth-client-id-metadata-document): MCP 2026-07-28 deprecates
 * Dynamic Client Registration in its favour, so clients need to discover
 * whether a URL `client_id` will be dereferenced here. The field is omitted
 * rather than advertised as `false`, so a deployment that has not opted in
 * publishes byte-identical metadata to before.
 */
export function buildAuthorizationServerMetadata(
  origin: string,
  config: McpOAuthProtocolConfig,
): OAuthAuthorizationServerMetadata {
  const resolved = createMcpOAuthProtocolConfig(config);
  const paths = buildMcpOAuthPaths(resolved);
  const normalizedOrigin = trimTrailingSlash(origin);

  return {
    issuer: `${normalizedOrigin}${paths.issuerPath}`,
    authorization_endpoint: `${normalizedOrigin}${paths.authorizePath}`,
    token_endpoint: `${normalizedOrigin}${paths.tokenPath}`,
    registration_endpoint: `${normalizedOrigin}${paths.registrationPath}`,
    jwks_uri: `${normalizedOrigin}${paths.jwksPath}`,
    response_types_supported: resolved.responseTypesSupported,
    grant_types_supported: resolved.grantTypesSupported,
    token_endpoint_auth_methods_supported: resolved.tokenEndpointAuthMethodsSupported,
    code_challenge_methods_supported: resolved.codeChallengeMethodsSupported,
    scopes_supported: resolved.scopesSupported,
    resource: resolved.resourceId,
    ...(resolved.clientIdMetadataDocumentSupported
      ? { client_id_metadata_document_supported: true }
      : {}),
  };
}

export function buildProtectedResourceMetadata(
  origin: string,
  config: McpOAuthProtocolConfig,
): OAuthProtectedResourceMetadata {
  const resolved = createMcpOAuthProtocolConfig(config);
  const paths = buildMcpOAuthPaths(resolved);
  const normalizedOrigin = trimTrailingSlash(origin);

  return {
    resource: resolved.resourceId,
    authorization_servers: [`${normalizedOrigin}${paths.issuerPath}`],
    jwks_uri: `${normalizedOrigin}${paths.jwksPath}`,
    bearer_methods_supported: resolved.bearerMethodsSupported,
    scopes_supported: resolved.scopesSupported,
  };
}

export function buildEmptyJwks(): { keys: [] } {
  return { keys: [] };
}

export function resolveRequestOrigin(request: Request): string {
  return new URL(request.url).origin;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)),
  );
}
