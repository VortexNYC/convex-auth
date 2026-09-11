/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    mcpOauth: {
      consumeAuthorizationCode: FunctionReference<
        "mutation",
        "internal",
        { clientId: string; code: string; redirectUri: string },
        null | {
          audience: string;
          clientId: string;
          codeChallenge: string;
          codeChallengeMethod: "S256";
          expiresAt: number;
          organizationId: string;
          resourceId: string;
          scopes: Array<string>;
          subjectId: string;
        },
        Name
      >;
      createAuthorizationCode: FunctionReference<
        "mutation",
        "internal",
        {
          audience: string;
          clientId: string;
          code: string;
          codeChallenge: string;
          codeChallengeMethod: "S256";
          expiresAt: number;
          organizationId: string;
          redirectUri: string;
          resourceId: string;
          scopes: Array<string>;
          state?: string;
          subjectId: string;
        },
        { code: string },
        Name
      >;
      createDynamicClient: FunctionReference<
        "mutation",
        "internal",
        {
          clientIdPrefix?: string;
          clientName: string;
          grantTypes?: Array<string>;
          redirectUris: Array<string>;
          responseTypes?: Array<string>;
          scope?: string;
          softwareId?: string | null;
          softwareVersion?: string | null;
          supportedScopes: Array<string>;
          tokenEndpointAuthMethod?: string;
        },
        {
          allowedScopes: Array<string>;
          clientId: string;
          clientIdIssuedAt: number;
          grantTypes?: Array<string>;
          name: string;
          pkceRequired?: boolean;
          redirectUris: Array<string>;
          registrationAccessToken: string | null;
          registrationClientUri: string | null;
          responseTypes?: Array<string>;
          softwareId: string | null;
          softwareVersion: string | null;
          tokenEndpointAuthMethod?: "none";
        },
        Name
      >;
      getSigningKey: FunctionReference<
        "query",
        "internal",
        {},
        null | {
          algorithm: "ES256";
          keyId: string;
          privateJwkJson: string;
          publicJwkJson: string;
        },
        Name
      >;
      issueRefreshToken: FunctionReference<
        "mutation",
        "internal",
        {
          audience: string;
          clientId: string;
          organizationId: string;
          resourceId: string;
          scopes: Array<string>;
          subjectId: string;
        },
        {
          expiresAt: number;
          inactivityExpiresAt: number | null;
          refreshToken: string;
        },
        Name
      >;
      listSigningKeys: FunctionReference<
        "query",
        "internal",
        { includeRetired?: boolean },
        Array<{
          algorithm: "ES256";
          keyId: string;
          privateJwkJson: string;
          publicJwkJson: string;
          retiredAt: number | null;
          status: "active" | "retired";
          updatedAt: number;
        }>,
        Name
      >;
      redeemRefreshToken: FunctionReference<
        "mutation",
        "internal",
        {
          client: {
            allowedScopes: Array<string>;
            clientId: string;
            grantTypes?: Array<string>;
            name: string;
            pkceRequired?: boolean;
            redirectUris: Array<string>;
            responseTypes?: Array<string>;
            softwareId?: string | null;
            softwareVersion?: string | null;
            tokenEndpointAuthMethod?: "none";
          };
          refreshToken: string;
          requestedScopes?: Array<string>;
        },
        | {
            audience: string;
            expiresAt: number;
            inactivityExpiresAt: number | null;
            ok: true;
            organizationId: string;
            refreshToken: string;
            resourceId: string;
            scopes: Array<string>;
            subjectId: string;
          }
        | {
            body: { error: string; error_description?: string };
            familyRevocation?: {
              familyId: string;
              reason: string;
              revokedAt: number;
            };
            ok: false;
            reason: string;
            status: number;
          },
        Name
      >;
      registerDynamicClient: FunctionReference<
        "mutation",
        "internal",
        {
          clientId: string;
          clientName: string;
          redirectUris: Array<string>;
          scope?: string;
          softwareId?: string | null;
          softwareVersion?: string | null;
          supportedScopes: Array<string>;
        },
        string,
        Name
      >;
      resolveClient: FunctionReference<
        "query",
        "internal",
        { clientId: string },
        null | {
          allowedScopes: Array<string>;
          clientId: string;
          grantTypes: Array<string>;
          name: string;
          pkceRequired: boolean;
          redirectUris: Array<string>;
          responseTypes: Array<string>;
          softwareId: string | null;
          softwareVersion: string | null;
          tokenEndpointAuthMethod: "none";
        },
        Name
      >;
      updateSigningKeyStatus: FunctionReference<
        "mutation",
        "internal",
        { keyId: string; retiredAt?: number; status: "active" | "retired" },
        string,
        Name
      >;
      upsertSigningKey: FunctionReference<
        "mutation",
        "internal",
        {
          algorithm: "ES256";
          keyId: string;
          privateJwkJson: string;
          publicJwkJson: string;
        },
        string,
        Name
      >;
    };
  };
