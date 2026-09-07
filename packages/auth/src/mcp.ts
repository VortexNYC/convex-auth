// Explicit public surface. Previously `export *` re-exported 91+ internal
// symbols for consumers that do not exist (this package is intended for external consumers;
// see docs/go-live-roadmap.md). This is the exact contract of the two real
// consumers: external apps (`convex-auth/mcp`) and this package's own
// Convex component (`component/mcp.ts`, via `../dist/mcp.js`). Add a symbol
// here only when one of those actually needs it.
export {
  // external consumer
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
  // MCP `io.modelcontextprotocol/oauth-client-credentials`: machine-to-machine
  // access for callers with no user present.
  validateMcpOAuthClientCredentialsTokenExchange,
  validateMcpOAuthClientIdMetadataDocument,
  verifyMcpOAuthClientAssertion,
  validateTokenEndpointClientAuthentication,
  verifyMcpOAuthAccessTokenWithStoredKeys,
  // Convex component consumer (component/mcp.ts)
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
