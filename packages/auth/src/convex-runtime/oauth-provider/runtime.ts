import {
  getMcpOAuthSessionTokenFromRequest,
  handleMcpOAuthAuthorizeRequest,
  handleMcpOAuthTokenRequest,
  type McpOAuthAuthorizeAccessResult,
  type McpOAuthResolvedIdentity,
  type McpOAuthResolvedSession,
  type McpOAuthTokenRequestArgs,
} from "../mcp/runtime.js";
import type { McpOAuthClient } from "../mcp/types.js";

export type OidcProviderClient = McpOAuthClient;

export type OidcAuthorizeRequestArgs<TClient extends OidcProviderClient> = {
  request: Request;
  issuer: string;
  resolveClient: (clientId: string) => Promise<TClient | null> | TClient | null;
  requireAllowedRedirectUri: (client: TClient, redirectUri: string) => void;
  resolveRequestedScopes: (scope: string) => readonly string[];
  resolveSessionFromToken: (
    sessionToken: string,
  ) => Promise<McpOAuthResolvedSession | null> | McpOAuthResolvedSession | null;
  resolveIdentityForSession: (
    session: McpOAuthResolvedSession,
  ) => Promise<McpOAuthResolvedIdentity | null> | McpOAuthResolvedIdentity | null;
  authorize: (input: {
    identity: McpOAuthResolvedIdentity;
    subjectId: string;
    requestedOrganizationId: string | null;
    requestedScopes: readonly string[];
  }) => Promise<McpOAuthAuthorizeAccessResult> | McpOAuthAuthorizeAccessResult;
  createAuthorizationCode: (input: {
    code: string;
    clientId: string;
    redirectUri: string;
    subjectId: string;
    organizationId: string;
    scopes: readonly string[];
    codeChallenge: string;
    codeChallengeMethod: "S256";
    state?: string;
    audience: string;
    resourceId: string;
    expiresAt: number;
  }) => Promise<void> | void;
  generateAuthorizationCode?: () => string;
  authorizationCodeExpiresInMs?: number;
  consentUrl?: string;
};

export async function handleOidcAuthorizeRequest<TClient extends OidcProviderClient>(
  args: OidcAuthorizeRequestArgs<TClient>,
): Promise<Response> {
  const { issuer, consentUrl, request, resolveSessionFromToken, ...handlerArgs } = args;

  if (consentUrl && new URL(request.url).searchParams.get("consent_approved") !== "true") {
    const sessionToken = getMcpOAuthSessionTokenFromRequest(request);
    if (sessionToken) {
      const session = await resolveSessionFromToken(sessionToken);
      if (session) {
        const consent = new URL(consentUrl, request.url);
        consent.searchParams.set("redirect_to", request.url);
        return new Response(null, {
          status: 302,
          headers: { location: consent.toString() },
        });
      }
    }
  }

  return handleMcpOAuthAuthorizeRequest({
    ...handlerArgs,
    request,
    resolveSessionFromToken,
    defaultAudience: issuer,
    defaultResourceId: issuer,
  });
}

export type OidcTokenRequestArgs<TClient extends OidcProviderClient> = Omit<
  McpOAuthTokenRequestArgs<TClient>,
  "clientCredentials"
>;

export async function handleOidcTokenRequest<TClient extends OidcProviderClient>(
  args: OidcTokenRequestArgs<TClient>,
): Promise<Response> {
  return handleMcpOAuthTokenRequest({ ...args, clientCredentials: undefined });
}
