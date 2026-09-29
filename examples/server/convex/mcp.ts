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
import { permissionGranted } from "./authz";

type ActionCtx = GenericActionCtx<GenericDataModel>;

const SUPPORTED_SCOPES = ["openid", "email", "profile", "mcp", "mcp:admin"] as const;

/* Scope → org permission binding. Identity scopes need no permission; `mcp`
 * (API access on behalf of the org) requires org membership; `mcp:admin`
 * requires the members:manage permission — the ceiling that keeps a plain
 * member from minting admin-scoped tokens. Scopes missing from this map are
 * DENIED (fail closed), not granted. */
const SCOPE_PERMISSIONS: Record<string, string | null> = {
  openid: null,
  email: null,
  profile: null,
  mcp: "organization:read",
  "mcp:admin": "organization:members:manage",
};

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
      /* Org-scoped authorization: organization_id is required when the user
       * has anything but exactly one active membership (mirrors the reference
       * runtime's ambiguity rule), and the member's role must carry each
       * scope's backing permission — granted scopes are the requested set
       * intersected with what the member is allowed. */
      authorize: async ({ identity, requestedOrganizationId, requestedScopes }) => {
        const memberships = (await ctx.runQuery(
          components.convexAuth.organizations.listMembershipsByUser,
          { userId: identity.userId, status: "active" },
        )) as { organizationId: string; roleId: string }[];

        let organizationId: string | null = requestedOrganizationId;
        if (organizationId === null && memberships.length !== 1) {
          return {
            ok: false as const,
            status: 400,
            body: {
              error: "invalid_request",
              error_description:
                "organization_id is required (user has zero or multiple memberships)",
            },
          };
        }
        organizationId ??= memberships[0]?.organizationId ?? null;

        const member = memberships.find((m) => m.organizationId === organizationId);
        if (member === undefined || organizationId === null) {
          return {
            ok: false as const,
            status: 403,
            body: {
              error: "access_denied",
              error_description: "User is not an active member of the requested organization",
            },
          };
        }

        const role = await ctx.runQuery(components.convexAuth.organizations.getRole, {
          organizationId,
          roleId: member.roleId,
        });
        const permissions: string[] = role?.permissions ?? [];
        /* Deny the whole request if any requested scope exceeds the member's
         * role — mirrors the runtime's validateScopes (403), and refuses to
         * mint a silently-scoped-down token the client never asked for. */
        const denied = requestedScopes.some((scope) => {
          const needed = SCOPE_PERMISSIONS[scope];
          /* unmapped scope → fail closed; null → identity scope, always OK */
          return (
            needed === undefined || (needed !== null && !permissionGranted(permissions, needed))
          );
        });
        if (denied) {
          return {
            ok: false as const,
            status: 403,
            body: {
              error: "insufficient_scope",
              error_description: "Requested scope exceeds the member's role permissions",
            },
          };
        }
        return { ok: true as const, organizationId, scopes: [...requestedScopes] };
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
