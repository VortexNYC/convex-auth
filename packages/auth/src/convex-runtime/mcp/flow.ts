import { validateTokenEndpointClientAuthentication } from "./clientAuth";
import {
  registerMcpOAuthClient,
  validateMcpOAuthDynamicClientRegistrationInput,
} from "./clientRegistration";
import { derivePkceChallenge } from "./pkce";
import { findMcpOAuthClientDisallowedScope } from "./scopePolicy";
import type {
  McpOAuthAuthorizationCodeRecord,
  McpOAuthAuthorizationCodeTokenExchangeFailure,
  McpOAuthAuthorizationCodeTokenExchangeSuccess,
  McpOAuthAuthorizationCodeTokenRequest,
  McpOAuthAuthorizeRequest,
  McpOAuthAuthorizeRequestConfig,
  McpOAuthClient,
  McpOAuthClientAssertionResult,
  McpOAuthClientCredentialsTokenExchangeFailure,
  McpOAuthClientCredentialsTokenExchangeSuccess,
  McpOAuthDynamicClientRegistrationInput,
  McpOAuthDynamicClientRegistrationPolicy,
  McpOAuthDynamicClientRegistrationResponse,
  McpOAuthDynamicClientRegistrationResult,
  McpOAuthDynamicClientRegistrationValidation,
  McpOAuthStoredClientRecord,
  McpOAuthTokenEndpointAuthMethod,
} from "./types";

export function parseMcpOAuthAuthorizeRequest(
  request: Request,
  config: McpOAuthAuthorizeRequestConfig,
): McpOAuthAuthorizeRequest {
  const url = new URL(request.url);
  assertAuthorizationCodeResponseType(url);
  const codeChallenge = parsePkceCodeChallenge(url);
  const { audience, resourceId } = parseAuthorizationTarget(url, config);

  return {
    audience,
    clientId: url.searchParams.get("client_id") ?? "",
    codeChallenge,
    expiresInMs: parseTestingExpiresInMs(url, config.allowTestingExpiresInMs ?? false),
    organizationId: url.searchParams.get("organization_id"),
    redirectUri: url.searchParams.get("redirect_uri") ?? "",
    resourceId,
    scope: url.searchParams.get("scope") ?? "",
    state: url.searchParams.get("state") ?? undefined,
  };
}

function assertAuthorizationCodeResponseType(url: URL): void {
  if (url.searchParams.get("response_type") !== "code") {
    throw new Error("unsupported_response_type");
  }
}

function parsePkceCodeChallenge(url: URL): string {
  const codeChallenge = url.searchParams.get("code_challenge") ?? "";
  const codeChallengeMethod = url.searchParams.get("code_challenge_method");
  if (codeChallenge.length === 0 || codeChallengeMethod !== "S256") {
    throw new Error("PKCE S256 required");
  }
  return codeChallenge;
}

function parseAuthorizationTarget(url: URL, config: McpOAuthAuthorizeRequestConfig) {
  const expectedAudience = config.expectedAudience ?? config.defaultAudience;
  const expectedResourceId = config.expectedResourceId ?? config.defaultResourceId;
  const audience = url.searchParams.get("audience") ?? config.defaultAudience;
  const resourceId = url.searchParams.get("resource") ?? config.defaultResourceId;

  if (resourceId !== expectedResourceId || audience !== expectedAudience) {
    throw new Error("invalid_target");
  }

  return { audience, resourceId };
}

export function parseMcpOAuthDynamicClientRegistrationRequest(
  body: unknown,
): McpOAuthDynamicClientRegistrationInput {
  if (!isRecord(body)) {
    throw new Error("client_name and redirect_uris are required");
  }

  const clientName = body.client_name;
  const redirectUris = parseStringArray(body.redirect_uris);
  const grantTypes =
    body.grant_types === undefined ? undefined : parseStringArray(body.grant_types);
  const responseTypes =
    body.response_types === undefined ? undefined : parseStringArray(body.response_types);

  if (typeof clientName !== "string" || redirectUris === null) {
    throw new Error("client_name and redirect_uris are required");
  }
  assertOptionalStringField(body, "scope", "scope must be a string when provided");
  assertOptionalStringField(
    body,
    "token_endpoint_auth_method",
    "token_endpoint_auth_method must be a string when provided",
  );
  if (grantTypes === null) {
    throw new Error("grant_types must be an array of strings when provided");
  }
  if (responseTypes === null) {
    throw new Error("response_types must be an array of strings when provided");
  }
  assertOptionalStringField(body, "software_id", "software_id must be a string when provided");
  assertOptionalStringField(
    body,
    "software_version",
    "software_version must be a string when provided",
  );

  return {
    clientName,
    redirectUris,
    scope: typeof body.scope === "string" ? body.scope : undefined,
    tokenEndpointAuthMethod: parseOptionalAuthMethod(body.token_endpoint_auth_method),
    grantTypes: grantTypes ?? undefined,
    responseTypes: responseTypes ?? undefined,
    softwareId: typeof body.software_id === "string" ? body.software_id : undefined,
    softwareVersion: typeof body.software_version === "string" ? body.software_version : undefined,
  };
}

function assertOptionalStringField(
  body: Record<string, unknown>,
  key: string,
  message: string,
): void {
  const value = body[key];
  if (value !== undefined && value !== null && typeof value !== "string") {
    throw new Error(message);
  }
}

export function validateMcpOAuthDynamicClientRegistrationRequest(
  body: unknown,
  policy: McpOAuthDynamicClientRegistrationPolicy,
): McpOAuthDynamicClientRegistrationValidation {
  const parsed = parseMcpOAuthDynamicClientRegistrationRequest(body);
  const validationError = validateMcpOAuthDynamicClientRegistrationInput(parsed, policy);
  return {
    parsed,
    validationError,
  };
}

export function createMcpOAuthStoredClientRecord(
  client: McpOAuthDynamicClientRegistrationResult,
  now: number,
): McpOAuthStoredClientRecord {
  return {
    clientId: client.clientId,
    name: client.name,
    redirectUris: Array.from(client.redirectUris),
    allowedScopes: Array.from(client.allowedScopes),
    tokenEndpointAuthMethod: client.tokenEndpointAuthMethod ?? "none",
    pkceRequired: client.pkceRequired ?? true,
    grantTypes: Array.from(client.grantTypes ?? ["authorization_code"]),
    responseTypes: Array.from(client.responseTypes ?? ["code"]),
    softwareId: client.softwareId ?? undefined,
    softwareVersion: client.softwareVersion ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildMcpOAuthDynamicClientRegistrationResponse(
  client: McpOAuthDynamicClientRegistrationResult,
  clientIdIssuedAt: number,
): McpOAuthDynamicClientRegistrationResponse {
  return {
    client_id: client.clientId,
    client_id_issued_at: clientIdIssuedAt,
    client_name: client.name,
    redirect_uris: client.redirectUris,
    grant_types: client.grantTypes,
    response_types: client.responseTypes,
    token_endpoint_auth_method: client.tokenEndpointAuthMethod,
    scope: client.allowedScopes.join(" "),
    ...(typeof client.softwareId === "string" ? { software_id: client.softwareId } : {}),
    ...(typeof client.softwareVersion === "string"
      ? { software_version: client.softwareVersion }
      : {}),
  };
}

export async function createMcpOAuthDynamicClient<TPersisted>(args: {
  input: McpOAuthDynamicClientRegistrationInput;
  policy: McpOAuthDynamicClientRegistrationPolicy;
  clientId?: string;
  generateClientId?: () => string;
  persist: (
    record: McpOAuthStoredClientRecord,
    registered: McpOAuthDynamicClientRegistrationResult,
  ) => Promise<TPersisted> | TPersisted;
  now?: number;
}): Promise<{
  client: McpOAuthDynamicClientRegistrationResult;
  clientIdIssuedAt: number;
  persisted: TPersisted;
}> {
  const now = args.now ?? Date.now();
  const client = registerMcpOAuthClient(args.input, args.policy, {
    clientId: args.clientId,
    generateClientId: args.generateClientId,
  });
  const persisted = await args.persist(createMcpOAuthStoredClientRecord(client, now), client);

  return {
    client,
    clientIdIssuedAt: Math.floor(now / 1000),
    persisted,
  };
}

export async function validateMcpOAuthAuthorizationCodeTokenExchange<
  TClient extends McpOAuthClient,
  TAuthorizationCode extends McpOAuthAuthorizationCodeRecord,
>(args: {
  request: Request;
  resolveClient: (clientId: string) => Promise<TClient | null> | TClient | null;
  consumeAuthorizationCode: (input: {
    code: string;
    clientId: string;
    redirectUri: string;
  }) => Promise<TAuthorizationCode | null> | TAuthorizationCode | null;
  /** Injectable clock (epoch millis) for the expiry check; defaults to now. */
  now?: number;
}): Promise<
  | McpOAuthAuthorizationCodeTokenExchangeFailure
  | McpOAuthAuthorizationCodeTokenExchangeSuccess<TClient, TAuthorizationCode>
> {
  const parsed = await parseMcpOAuthAuthorizationCodeTokenRequest(args.request);

  const clientAuthenticationError = validateTokenEndpointClientAuthentication({
    authorizationHeader: parsed.authorizationHeader,
    clientSecret: parsed.clientSecret,
  });
  if (clientAuthenticationError !== null) {
    return tokenExchangeFailure(400, clientAuthenticationError);
  }

  if (parsed.grantType !== "authorization_code") {
    return unsupportedGrantTypeFailure();
  }

  if (!hasRequiredTokenRequestParams(parsed)) {
    return invalidRequestFailure();
  }

  const client = await args.resolveClient(parsed.clientId);
  if (client === null) {
    return unknownClientFailure();
  }

  if (!client.redirectUris.includes(parsed.redirectUri)) {
    return invalidGrantFailure(`Invalid redirect URI: ${parsed.redirectUri}`);
  }

  const authorizationCode = await args.consumeAuthorizationCode({
    code: parsed.code,
    clientId: parsed.clientId,
    redirectUri: parsed.redirectUri,
  });
  if (authorizationCode === null) {
    return invalidGrantFailure("Authorization code not found or already consumed");
  }

  const disallowedScope = findMcpOAuthClientDisallowedScope(client, authorizationCode.scopes);
  if (disallowedScope !== null) {
    return invalidGrantFailure("Authorization code scope is not allowed for client");
  }

  const now = args.now ?? Date.now();
  if (isAuthorizationCodeExpired(authorizationCode, now)) {
    return invalidGrantFailure("Authorization code expired");
  }

  const derivedChallenge = await derivePkceChallenge(parsed.codeVerifier);
  if (derivedChallenge !== authorizationCode.codeChallenge) {
    return invalidGrantFailure("PKCE verifier mismatch");
  }

  return {
    ok: true,
    client,
    authorizationCode,
  };
}

/**
 * Validate a `client_credentials` token request.
 *
 * Implements the MCP `io.modelcontextprotocol/oauth-client-credentials`
 * extension: machine-to-machine access for callers with no user present
 * (background services, daemons, server-to-server). The client authenticates
 * with its own credential instead of redeeming a user's authorization code,
 * so there is no PKCE verifier and no redirect URI to check.
 *
 * Verifying the presented secret is the caller's job — it holds the stored
 * client record and the hashing scheme. This establishes that the grant is
 * permitted, the method is supported, and the requested scopes stay inside the
 * client's registered ceiling.
 */
export async function validateMcpOAuthClientCredentialsTokenExchange<
  TClient extends McpOAuthClient,
>(args: {
  request: Request;
  resolveClient: (clientId: string) => Promise<TClient | null> | TClient | null;
  /**
   * Auth methods this deployment accepts. Confidential methods must be listed
   * for a machine client to authenticate at all; the historical default of
   * `none` keeps public-client deployments unchanged.
   */
  supportedMethods?: readonly McpOAuthTokenEndpointAuthMethod[];
  /**
   * Verify an RFC 7523 assertion against the client's registered keys.
   *
   * Required whenever a client presents `client_assertion`: without it the
   * grant fails closed rather than accepting an unverified assertion. Secret
   * verification stays with the caller (it owns the hashing scheme), but an
   * assertion is self-contained, so leaving it optional would make "forgot to
   * verify" indistinguishable from "verified".
   */
  verifyClientAssertion?: (args: {
    assertion: string;
    assertionType: string;
    clientId: string;
  }) => Promise<McpOAuthClientAssertionResult> | McpOAuthClientAssertionResult;
  /**
   * Verify a presented client secret against the stored client.
   *
   * Required whenever a secret is presented, for the same reason the assertion
   * verifier is: without it "forgot to verify" and "verified" are the same
   * outcome. The caller supplies it because it owns the hashing scheme.
   */
  verifyClientSecret?: (args: {
    clientId: string;
    clientSecret: string;
  }) => Promise<boolean> | boolean;
}): Promise<
  | McpOAuthClientCredentialsTokenExchangeFailure
  | McpOAuthClientCredentialsTokenExchangeSuccess<TClient>
> {
  const parsed = await parseMcpOAuthClientCredentialsTokenRequest(args.request);

  const clientAuthenticationError = validateTokenEndpointClientAuthentication({
    authorizationHeader: parsed.authorizationHeader,
    clientSecret: parsed.clientSecret,
    clientAssertion: parsed.clientAssertion,
    supportedMethods: args.supportedMethods,
  });
  if (clientAuthenticationError !== null) {
    return tokenExchangeFailure(401, clientAuthenticationError);
  }

  if (parsed.grantType !== "client_credentials") {
    return tokenExchangeFailure(400, {
      error: "unsupported_grant_type",
      error_description: "Expected client_credentials",
    });
  }

  if (parsed.clientId === null || parsed.clientId.length === 0) {
    return invalidRequestFailure();
  }

  const client = await args.resolveClient(parsed.clientId);
  if (client === null) {
    return unknownClientFailure();
  }

  // The grant must be one the client registered for. Without this an
  // authorization-code client could mint a user-less token for itself.
  if (!(client.grantTypes ?? []).includes("client_credentials")) {
    return tokenExchangeFailure(400, {
      error: "unauthorized_client",
      error_description: "Client is not registered for the client_credentials grant",
    });
  }

  // The client must authenticate the way it registered. Checking only the
  // deployment's supported set lets a client registered for one confidential
  // method authenticate with another — a downgrade the client never agreed to.
  const presentedMethod =
    parsed.clientAssertion !== null && parsed.clientAssertion.length > 0
      ? "private_key_jwt"
      : parsed.authorizationHeader !== null
        ? "client_secret_basic"
        : parsed.clientSecret !== null && parsed.clientSecret.length > 0
          ? "client_secret_post"
          : null;
  const registeredMethod = client.tokenEndpointAuthMethod ?? "none";
  // A confidential client that presents nothing must not authenticate as a
  // public one. Without this, the `none` default in client authentication lets
  // a no-credential request through and both verification blocks below are
  // skipped, minting a token with nothing checked.
  if (presentedMethod === null && registeredMethod !== "none") {
    return tokenExchangeFailure(401, {
      error: "invalid_client",
      error_description: `Client must authenticate with ${registeredMethod}`,
    });
  }
  if (presentedMethod !== null && presentedMethod !== registeredMethod) {
    return tokenExchangeFailure(401, {
      error: "invalid_client",
      error_description: `Client is registered for ${registeredMethod}, not ${presentedMethod}`,
    });
  }

  if (parsed.clientSecret !== null && parsed.clientSecret.length > 0) {
    if (args.verifyClientSecret === undefined) {
      return tokenExchangeFailure(401, {
        error: "invalid_client",
        error_description: "client_secret presented but this deployment cannot verify secrets",
      });
    }
    const secretOk = await args.verifyClientSecret({
      clientId: parsed.clientId,
      clientSecret: parsed.clientSecret,
    });
    if (!secretOk) {
      return tokenExchangeFailure(401, {
        error: "invalid_client",
        error_description: "client_secret is invalid",
      });
    }
  }

  if (parsed.clientAssertion !== null && parsed.clientAssertion.length > 0) {
    if (args.verifyClientAssertion === undefined) {
      return tokenExchangeFailure(401, {
        error: "invalid_client",
        error_description:
          "client_assertion presented but this deployment cannot verify assertions",
      });
    }
    const assertionResult = await args.verifyClientAssertion({
      assertion: parsed.clientAssertion,
      assertionType: parsed.clientAssertionType ?? "",
      clientId: parsed.clientId,
    });
    if (!assertionResult.ok) {
      return tokenExchangeFailure(401, {
        error: assertionResult.error,
        error_description: assertionResult.errorDescription,
      });
    }
  }

  // Omitted scope means "everything this client is entitled to", never
  // "everything the server offers".
  const requestedScopes =
    parsed.scope === null
      ? [...client.allowedScopes]
      : parsed.scope.split(/\s+/u).filter((scope) => scope.length > 0);

  const disallowedScope = findMcpOAuthClientDisallowedScope(client, requestedScopes);
  if (disallowedScope !== null) {
    return tokenExchangeFailure(400, {
      error: "invalid_scope",
      error_description: `Scope is not allowed for client: ${disallowedScope}`,
    });
  }

  return { ok: true, client, scopes: requestedScopes };
}

async function parseMcpOAuthClientCredentialsTokenRequest(request: Request) {
  const params = new URLSearchParams(await request.text());
  return {
    grantType: getOptionalSearchParam(params, "grant_type"),
    clientId: getOptionalSearchParam(params, "client_id"),
    clientSecret: getOptionalSearchParam(params, "client_secret"),
    clientAssertion: getOptionalSearchParam(params, "client_assertion"),
    clientAssertionType: getOptionalSearchParam(params, "client_assertion_type"),
    scope: getOptionalSearchParam(params, "scope"),
    authorizationHeader: request.headers.get("authorization"),
  };
}

function tokenExchangeFailure(
  status: number,
  body: McpOAuthAuthorizationCodeTokenExchangeFailure["body"],
): McpOAuthAuthorizationCodeTokenExchangeFailure {
  return { ok: false, status, body };
}

function unsupportedGrantTypeFailure(): McpOAuthAuthorizationCodeTokenExchangeFailure {
  return tokenExchangeFailure(400, {
    error: "unsupported_grant_type",
    error_description: "Only authorization_code is supported",
  });
}

function invalidRequestFailure(): McpOAuthAuthorizationCodeTokenExchangeFailure {
  return tokenExchangeFailure(400, { error: "invalid_request" });
}

function unknownClientFailure(): McpOAuthAuthorizationCodeTokenExchangeFailure {
  return tokenExchangeFailure(400, {
    error: "invalid_client",
    error_description: "Unknown OAuth client",
  });
}

function invalidGrantFailure(
  errorDescription?: string,
): McpOAuthAuthorizationCodeTokenExchangeFailure {
  return tokenExchangeFailure(400, {
    error: "invalid_grant",
    ...(errorDescription === undefined ? {} : { error_description: errorDescription }),
  });
}

function hasRequiredTokenRequestParams(
  parsed: McpOAuthAuthorizationCodeTokenRequest,
): parsed is McpOAuthAuthorizationCodeTokenRequest & {
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
} {
  return (
    parsed.code !== null &&
    parsed.clientId !== null &&
    parsed.redirectUri !== null &&
    parsed.codeVerifier !== null
  );
}

function isAuthorizationCodeExpired(
  authorizationCode: McpOAuthAuthorizationCodeRecord,
  now: number,
): boolean {
  // Fail closed when a consumer ignored the package-stamped expiry contract.
  return typeof authorizationCode.expiresAt !== "number" || now >= authorizationCode.expiresAt;
}

async function parseMcpOAuthAuthorizationCodeTokenRequest(
  request: Request,
): Promise<McpOAuthAuthorizationCodeTokenRequest> {
  const params = new URLSearchParams(await request.text());

  return {
    grantType: getOptionalSearchParam(params, "grant_type"),
    code: getOptionalSearchParam(params, "code"),
    clientId: getOptionalSearchParam(params, "client_id"),
    redirectUri: getOptionalSearchParam(params, "redirect_uri"),
    codeVerifier: getOptionalSearchParam(params, "code_verifier"),
    clientSecret: getOptionalSearchParam(params, "client_secret"),
    authorizationHeader: request.headers.get("authorization"),
  };
}

function parseTestingExpiresInMs(url: URL, allowTestingExpiresInMs: boolean): number | undefined {
  if (!allowTestingExpiresInMs) {
    return undefined;
  }

  const value = url.searchParams.get("testing_expires_in_ms");
  if (value === null) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function getOptionalSearchParam(params: URLSearchParams, key: string): string | null {
  return params.get(key);
}

function parseOptionalAuthMethod(value: unknown): McpOAuthTokenEndpointAuthMethod | undefined {
  return value === "client_secret_basic" || value === "client_secret_post" || value === "none"
    ? value
    : undefined;
}

function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.every((entry) => typeof entry === "string") ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
