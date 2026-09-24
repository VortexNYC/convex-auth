import type {
  McpOAuthTokenEndpointAuthMethod,
  McpOAuthTokenEndpointClientAuthArgs,
  McpOAuthTokenEndpointClientAuthError,
} from "./types";

const DEFAULT_SUPPORTED_METHODS = ["none"] as const;

/**
 * Authenticate a client at the token endpoint.
 *
 * The server was built for public clients: PKCE-protected, `none` as the only
 * auth method, and any presented credential rejected outright. Machine clients
 * (the `client_credentials` grant, per the MCP `oauth-client-credentials`
 * extension) have no user to redirect and no PKCE verifier, so the credential
 * *is* the authentication — which means confidential methods must be honoured
 * rather than refused.
 *
 * Which methods are live is decided by `supportedMethods`, defaulting to the
 * historical `none`. A deployment that has not opted in keeps the exact
 * public-client behaviour it had before.
 *
 * A request presenting no credential is valid only where an unauthenticated
 * client is acceptable — i.e. `none` is live (public client + PKCE).
 */
export function validateTokenEndpointClientAuthentication(
  args: McpOAuthTokenEndpointClientAuthArgs,
): McpOAuthTokenEndpointClientAuthError | null {
  const supportedMethods = args.supportedMethods ?? DEFAULT_SUPPORTED_METHODS;
  const presented = presentedCredential(args);

  if (presented === null) {
    if (supportedMethods.includes("none")) {
      return null;
    }
    return authError(
      `Client authentication is required. Supported token endpoint auth methods: ${supportedMethods.join(", ")}`,
    );
  }

  if (!supportedMethods.includes(presented)) {
    return authError(
      `Client authentication is not supported. Supported token endpoint auth methods: ${supportedMethods.join(", ")}`,
    );
  }

  return null;
}

/**
 * Classify the credential the client presented, without validating it.
 *
 * A Basic header is `client_secret_basic`; a secret in the request body is
 * `client_secret_post`. Verifying the secret itself belongs to the caller,
 * which holds the stored client record — this only establishes *which* method
 * was attempted so an unsupported one fails before any comparison runs.
 *
 * Assertions are checked first: `private_key_jwt` is a distinct method, and a
 * client presenting one must not be classified as (and evaluated against) a
 * secret method.
 */
function presentedCredential(
  args: McpOAuthTokenEndpointClientAuthArgs,
): McpOAuthTokenEndpointAuthMethod | null {
  if (typeof args.clientAssertion === "string" && args.clientAssertion.length > 0) {
    return "private_key_jwt";
  }
  if (args.authorizationHeader !== null) {
    return "client_secret_basic";
  }
  if (hasClientSecret(args.clientSecret)) {
    return "client_secret_post";
  }
  return null;
}

/**
 * Whether the request carries a `client_secret` field at all. A parsed
 * multipart/form-data entry counts as presented even though it holds no
 * usable string secret — the attempt still classifies as `client_secret_post`
 * and fails verification downstream.
 */
function hasClientSecret(
  clientSecret: McpOAuthTokenEndpointClientAuthArgs["clientSecret"],
): boolean {
  if (clientSecret === null) {
    return false;
  }
  if (typeof clientSecret === "string") {
    return clientSecret.length > 0;
  }
  return true;
}

function authError(description: string): McpOAuthTokenEndpointClientAuthError {
  return { error: "invalid_client", error_description: description };
}
