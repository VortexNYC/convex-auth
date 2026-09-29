import { httpAction } from "./_generated/server";
import { components } from "./_generated/api";
import type { GenericActionCtx, GenericDataModel, HttpRouter } from "convex/server";
import {
  buildMcpOAuthPublicJwks,
  createMcpOAuthHttpHandlers,
  createMcpOAuthSigningKeyRecord,
  signMcpOAuthAccessTokenWithStoredKey,
} from "@vortex-api/convex-auth/mcp";
import type { McpOAuthClient } from "@vortex-api/convex-auth/mcp";

type ActionCtx = GenericActionCtx<GenericDataModel>;

const SUPPORTED_SCOPES = ["openid", "email", "profile", "mcp"] as const;

function issuerFor(request: Request): string {
  return new URL(request.url).origin;
}

function handlersFor(ctx: ActionCtx, issuer: string) {
  const resolveClient = async (clientId: string): Promise<McpOAuthClient | null> =>
    (await ctx.runQuery(components.convexAuth.mcp.resolveClient, {
      clientId,
    })) as McpOAuthClient | null;

  return createMcpOAuthHttpHandlers<McpOAuthClient>({
    authorize: {
      defaultAudience: issuer,
      defaultResourceId: issuer,
      resolveClient,
      requireAllowedRedirectUri: (client, redirectUri) => {
        if (!client.redirectUris.includes(redirectUri)) {
          throw new Error("invalid_redirect_uri");
        }
      },
      resolveRequestedScopes: (scope) => scope.split(" ").filter((s) => s.length > 0),
      resolveSessionFromToken: async (sessionToken) => {
        const session = await ctx.runQuery(
          components.convexAuth.native.sessions.getSessionByToken,
          { token: sessionToken },
        );
        if (
          session === null ||
          session.revokedAt !== undefined ||
          session.expiresAt <= Date.now()
        ) {
          return null;
        }
        return { subjectId: session.userId };
      },
      resolveIdentityForSession: async (session) => {
        const user = await ctx.runQuery(components.convexAuth.native.users.getUserById, {
          userId: session.subjectId,
        });
        return user === null ? null : { userId: user._id };
      },
      /* Org-scoped authorization: the requested organization (or the caller's
       * first active membership when none is requested) must be an org the
       * user actively belongs to — no membership, no code. */
      authorize: async ({ identity, requestedOrganizationId, requestedScopes }) => {
        const memberships = await ctx.runQuery(
          components.convexAuth.organizations.listMembershipsByUser,
          { userId: identity.userId, status: "active" },
        );
        const organizationId = requestedOrganizationId ?? memberships[0]?.organizationId ?? null;
        const allowed =
          organizationId !== null &&
          memberships.some((m: { organizationId: string }) => m.organizationId === organizationId);
        if (!allowed || organizationId === null) {
          return {
            ok: false as const,
            status: 403,
            body: {
              error: "access_denied",
              error_description: "User is not an active member of the requested organization",
            },
          };
        }
        return { ok: true as const, organizationId, scopes: requestedScopes };
      },
      createAuthorizationCode: async (input) => {
        await ctx.runMutation(components.convexAuth.mcp.createAuthorizationCode, {
          ...input,
          scopes: [...input.scopes],
        });
      },
    },
    clientRegistration: {
      supportedScopes: [...SUPPORTED_SCOPES],
      createDynamicClient: async (registration) =>
        await ctx.runMutation(components.convexAuth.mcp.createDynamicClient, {
          clientName: registration.clientName,
          redirectUris: [...registration.redirectUris],
          scope: registration.scope ?? undefined,
          tokenEndpointAuthMethod: registration.tokenEndpointAuthMethod ?? undefined,
          grantTypes: registration.grantTypes ? [...registration.grantTypes] : undefined,
          responseTypes: registration.responseTypes ? [...registration.responseTypes] : undefined,
          softwareId: registration.softwareId ?? undefined,
          softwareVersion: registration.softwareVersion ?? undefined,
          supportedScopes: [...SUPPORTED_SCOPES],
        }),
    },
    token: {
      resolveClient,
      consumeAuthorizationCode: async (input) =>
        await ctx.runMutation(components.convexAuth.mcp.consumeAuthorizationCode, input),
      issueRefreshToken: async (input) =>
        await ctx.runMutation(components.convexAuth.mcp.issueRefreshToken, {
          ...input,
          scopes: [...input.scopes],
        }),
      redeemRefreshToken: async (input) =>
        await ctx.runMutation(components.convexAuth.mcp.redeemRefreshToken, {
          client: {
            clientId: input.client.clientId,
            name: input.client.name,
            redirectUris: [...input.client.redirectUris],
            allowedScopes: [...input.client.allowedScopes],
            tokenEndpointAuthMethod:
              input.client.tokenEndpointAuthMethod === "none" ? "none" : undefined,
            pkceRequired: input.client.pkceRequired,
            grantTypes: input.client.grantTypes ? [...input.client.grantTypes] : undefined,
            responseTypes: input.client.responseTypes ? [...input.client.responseTypes] : undefined,
            softwareId: input.client.softwareId,
            softwareVersion: input.client.softwareVersion,
          },
          refreshToken: input.refreshGrant.refreshToken,
          requestedScopes: [...input.refreshGrant.requestedScopes],
        }),
      signAccessToken: async (input) =>
        await signMcpOAuthAccessTokenWithStoredKey({
          loadActiveSigningKey: async () =>
            await ctx.runQuery(components.convexAuth.mcp.getSigningKey, {}),
          persistSigningKey: async (key) => {
            await ctx.runMutation(components.convexAuth.mcp.upsertSigningKey, key);
          },
          createSigningKey: createMcpOAuthSigningKeyRecord,
          issuer,
          audience: input.audience,
          subject: input.subjectId,
          claims: {
            clientId: input.clientId,
            subjectId: input.subjectId,
            resourceId: input.audience,
            scopes: [...input.scopes],
            organizationId: input.organizationId,
          },
        }),
    },
  });
}

export function registerMcpOAuthRoutes(http: HttpRouter): void {
  http.route({
    path: "/oauth/register",
    method: "POST",
    handler: httpAction(async (ctx, request) =>
      handlersFor(ctx, issuerFor(request)).handleClientRegistrationRequest(request),
    ),
  });
  http.route({
    path: "/oauth/authorize",
    method: "GET",
    handler: httpAction(async (ctx, request) =>
      handlersFor(ctx, issuerFor(request)).handleAuthorizeRequest(request),
    ),
  });
  http.route({
    path: "/oauth/token",
    method: "POST",
    handler: httpAction(async (ctx, request) =>
      handlersFor(ctx, issuerFor(request)).handleTokenRequest(request),
    ),
  });
  http.route({
    path: "/oauth/jwks",
    method: "GET",
    handler: httpAction(async (ctx, _request) => {
      const jwks = await buildMcpOAuthPublicJwks({
        listSigningKeys: async () =>
          await ctx.runQuery(components.convexAuth.mcp.listSigningKeys, {
            includeRetired: true,
          }),
      });
      return new Response(JSON.stringify(jwks), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  });
}
