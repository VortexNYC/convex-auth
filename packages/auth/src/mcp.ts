/**
 * Explicit public surface for `convex-auth/mcp`. The exports are grouped by
 * consumer: external apps first, the MCP `oauth-client-credentials` grant
 * (machine-to-machine, no user present) in the middle, and this package's own
 * Convex component (`component/mcp.ts`, via `../dist/mcp.js`) last. Add a
 * symbol only when one of those consumers actually needs it — `export *` here
 * previously leaked 91+ internal symbols.
 */
export {
  buildAuthorizationServerMetadata,
  buildEmptyJwks,
  buildMcpOAuthIssuer,
  buildMcpOAuthPaths,
  buildMcpOAuthPublicJwks,
  buildProtectedResourceMetadata,
  createMcpOAuthAccessRuntime,
  createMcpOAuthHttpHandlers,
  createMcpOAuthProtocolConfig,
  createMcpOAuthSigningKeyRecord,
  assertMcpOAuthClientIdMetadataUrl,
  createPkcePair,
  isMcpOAuthClientIdMetadataAddressAllowed,
  MCP_OAUTH_CIMD_DEFAULT_CACHE_TTL_MS,
  MCP_OAUTH_CIMD_FETCH_TIMEOUT_MS,
  MCP_OAUTH_CIMD_MAX_DOCUMENT_BYTES,
  MCP_OAUTH_CIMD_MAX_REDIRECTS,
  MCP_OAUTH_CLIENT_ASSERTION_MAX_LIFETIME_SECONDS,
  MCP_OAUTH_CLIENT_ASSERTION_TYPE,
  derivePkceChallenge,
  ensureMcpOAuthSigningKey,
  MCP_OAUTH_RETIRED_SIGNING_KEY_RETENTION_MS,
  resolveRequestOrigin,
  rotateMcpOAuthSigningKey,
  shouldPublishMcpOAuthSigningKey,
  signMcpOAuthAccessTokenWithStoredKey,
  validateMcpOAuthClientCredentialsTokenExchange,
  validateMcpOAuthClientIdMetadataDocument,
  verifyMcpOAuthClientAssertion,
  validateTokenEndpointClientAuthentication,
  verifyMcpOAuthAccessTokenWithStoredKeys,
  createMcpOAuthDynamicClient,
  createMcpOAuthRefreshToken,
  createMcpOAuthRefreshTokenPolicy,
  createMcpOAuthStoredClientRecord,
  hashMcpOAuthRefreshToken,
  redeemMcpOAuthRefreshToken,
  registerMcpOAuthClient,
} from "./convex-runtime/mcp";

export type {
  McpOAuthClient,
  McpOAuthClientAssertionKey,
  McpOAuthClientIdMetadataResult,
  McpOAuthClientIdMetadataValidateArgs,
  McpOAuthClientAssertionResult,
  McpOAuthClientAssertionVerifyArgs,
  McpOAuthClientCredentialsTarget,
  McpOAuthClientCredentialsTokenExchangeFailure,
  McpOAuthClientCredentialsTokenExchangeSuccess,
  McpOAuthSignedAccessToken,
  McpOAuthSigningKeyRecord,
  McpOAuthTokenEndpointClientAuthArgs,
  McpOAuthTokenEndpointClientAuthError,
  OAuthAuthorizationServerMetadata,
  OAuthProtectedResourceMetadata,
  PkcePair,
  McpOAuthRefreshTokenRecord,
  McpOAuthStoredClientRecord,
} from "./convex-runtime/mcp";
