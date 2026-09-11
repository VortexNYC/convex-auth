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
    agentAuth: {
      cleanupExpiredAgentHostReplayRecords: FunctionReference<
        "mutation",
        "internal",
        { limit?: number },
        { deleted: number },
        Name
      >;
      cleanupExpiredAgentReplayRecords: FunctionReference<
        "mutation",
        "internal",
        { limit?: number },
        { deleted: number },
        Name
      >;
      consumeAgentCredential: FunctionReference<
        "mutation",
        "internal",
        {
          agentId: string;
          claimedCapabilities?: Array<string>;
          claimedPermissions?: Array<string>;
          hostKeyGeneration?: number;
          keyGeneration: number;
          replayExpiresAt: number;
          replayIdHash: string;
          requestedOrganizationId?: string;
        },
        {
          agentId: string;
          capabilityGrants: Array<{
            capability: string;
            constraintsJson?: string;
            expiresAt?: number;
          }>;
          credentialId: string;
          delegatedUserId: string | null;
          hostId: string;
          isRestricted: boolean;
          kind: "agent";
          mode: "delegated" | "autonomous";
          organizationId: string;
          permissions: Array<string>;
          restrictedReason: string | null;
        },
        Name
      >;
      consumeAgentHostRequest: FunctionReference<
        "mutation",
        "internal",
        {
          hostId: string;
          keyGeneration: number;
          replayExpiresAt: number;
          replayIdHash: string;
          requestedOrganizationId?: string;
        },
        { hostId: string; keyGeneration: number; organizationId: string },
        Name
      >;
      decideAgentDeviceAuthorization: FunctionReference<
        "mutation",
        "internal",
        {
          decision: "approved" | "denied";
          operatorUserId: string;
          organizationId: string;
          userCodeHash: string;
        },
        | { ok: true; status: "approved" | "denied" }
        | {
            ok: false;
            reason: "invalid_code" | "rate_limited";
            retryAt?: number;
          },
        Name
      >;
      getAgentAuthorityStatus: FunctionReference<
        "query",
        "internal",
        { agentId: string; organizationId: string },
        null | {
          absoluteExpiresAt?: number;
          activeKeyGeneration: number;
          agentId: string;
          expiresAt?: number;
          hostId: string;
          mode: "delegated" | "autonomous";
          organizationId: string;
          status: "pending" | "active" | "expired" | "revoked" | "rejected";
        },
        Name
      >;
      getAgentHostAuthorityStatus: FunctionReference<
        "query",
        "internal",
        { hostId: string; organizationId: string },
        null | {
          activeKeyGeneration: number;
          cascadeCompletedAt?: number;
          hostId: string;
          organizationId: string;
          status: "pending" | "active" | "revoked" | "rejected";
        },
        Name
      >;
      getAgentHostProtocolVerificationMaterial: FunctionReference<
        "query",
        "internal",
        { thumbprint: string },
        null | {
          generation: number;
          hostId: string;
          organizationId: string;
          publicJwkJson: string;
          thumbprint: string;
        },
        Name
      >;
      getAgentProtocolVerificationMaterial: FunctionReference<
        "query",
        "internal",
        { agentId: string; hostThumbprint: string },
        null | {
          agentId: string;
          agentKeyGeneration: number;
          agentPublicJwkJson: string;
          hostId: string;
          hostKeyGeneration: number;
          hostThumbprint: string;
          organizationId: string;
        },
        Name
      >;
      getAgentVerificationMaterial: FunctionReference<
        "query",
        "internal",
        { thumbprint: string },
        null | {
          agentId: string;
          generation: number;
          hostId: string;
          organizationId: string;
          publicJwkJson: string;
          thumbprint: string;
        },
        Name
      >;
      introspectAgentAuthority: FunctionReference<
        "query",
        "internal",
        {
          agentId: string;
          claimedCapabilities?: Array<string>;
          claimedPermissions?: Array<string>;
          organizationId: string;
        },
        | { active: false }
        | {
            absoluteExpiresAt?: number;
            active: true;
            agentId: string;
            capabilityGrants: Array<{
              capability: string;
              constraintsJson?: string;
              expiresAt?: number;
            }>;
            delegatedUserId: string | null;
            expiresAt?: number;
            hostId: string;
            mode: "delegated" | "autonomous";
            organizationId: string;
            permissions: Array<string>;
          },
        Name
      >;
      pollAgentDeviceAuthorization: FunctionReference<
        "mutation",
        "internal",
        { deviceCodeHash: string },
        | { interval: number; status: "authorization_pending" }
        | { interval: number; status: "slow_down" }
        | { status: "expired_token" }
        | { status: "access_denied" }
        | { agentId: string; status: "approved" },
        Name
      >;
      reactivateAgent: FunctionReference<
        "mutation",
        "internal",
        {
          agentId: string;
          expiresAt: number;
          operatorUserId: string;
          organizationId: string;
        },
        { status: "active" | "revoked" },
        Name
      >;
      reactivateAgentAsHost: FunctionReference<
        "mutation",
        "internal",
        {
          agentId: string;
          expiresAt: number;
          hostId: string;
          organizationId: string;
        },
        { status: "active" | "revoked" },
        Name
      >;
      registerAgent: FunctionReference<
        "mutation",
        "internal",
        {
          delegatedUserId?: string;
          hostId: string;
          mode: "delegated" | "autonomous";
          name: string;
          organizationId: string;
          permissions: Array<string>;
          publicJwkJson: string;
          requestedGrants: Array<{
            capability: string;
            constraintsJson?: string;
            expiresAt?: number;
          }>;
        },
        { id: string },
        Name
      >;
      registerAgentHost: FunctionReference<
        "mutation",
        "internal",
        {
          createdBy: string;
          name: string;
          organizationId: string;
          publicJwkJson: string;
        },
        { id: string },
        Name
      >;
      registerAgentWithDeviceAuthorization: FunctionReference<
        "mutation",
        "internal",
        {
          delegatedUserId?: string;
          deviceAuthorization: {
            deviceCodeHash: string;
            expiresAt: number;
            pollIntervalSeconds: number;
            userCodeHash: string;
          };
          hostId: string;
          mode: "delegated" | "autonomous";
          name: string;
          organizationId: string;
          permissions: Array<string>;
          publicJwkJson: string;
          requestedGrants: Array<{
            capability: string;
            constraintsJson?: string;
            expiresAt?: number;
          }>;
        },
        { agentId: string; authorizationId: string },
        Name
      >;
      revokeAgentAsHost: FunctionReference<
        "mutation",
        "internal",
        { agentId: string; hostId: string; organizationId: string },
        { ok: true },
        Name
      >;
      revokeAgentHostAsHost: FunctionReference<
        "mutation",
        "internal",
        { hostId: string; organizationId: string },
        { ok: true },
        Name
      >;
      rotateAgentHostKey: FunctionReference<
        "mutation",
        "internal",
        {
          expectedGeneration: number;
          hostId: string;
          operatorUserId: string;
          organizationId: string;
          publicJwkJson: string;
        },
        { generation: number; thumbprint: string },
        Name
      >;
      rotateAgentHostKeyAsHost: FunctionReference<
        "mutation",
        "internal",
        {
          expectedGeneration: number;
          hostId: string;
          organizationId: string;
          publicJwkJson: string;
        },
        { generation: number; thumbprint: string },
        Name
      >;
      rotateAgentKey: FunctionReference<
        "mutation",
        "internal",
        {
          agentId: string;
          expectedGeneration: number;
          operatorUserId: string;
          organizationId: string;
          publicJwkJson: string;
        },
        { generation: number; thumbprint: string },
        Name
      >;
      rotateAgentKeyAsAgent: FunctionReference<
        "mutation",
        "internal",
        {
          agentId: string;
          expectedGeneration: number;
          organizationId: string;
          publicJwkJson: string;
        },
        { generation: number; thumbprint: string },
        Name
      >;
      rotateAgentKeyAsHost: FunctionReference<
        "mutation",
        "internal",
        {
          agentId: string;
          expectedGeneration: number;
          hostId: string;
          organizationId: string;
          publicJwkJson: string;
        },
        { generation: number; thumbprint: string },
        Name
      >;
      setAgentCapabilityGrantStatus: FunctionReference<
        "mutation",
        "internal",
        {
          agentId: string;
          capability: string;
          operatorUserId: string;
          organizationId: string;
          reason?: string;
          status: "pending" | "active" | "denied" | "revoked";
        },
        { ok: true },
        Name
      >;
      setAgentHostStatus: FunctionReference<
        "mutation",
        "internal",
        {
          hostId: string;
          operatorUserId: string;
          organizationId: string;
          status: "pending" | "active" | "revoked" | "rejected";
        },
        { ok: true },
        Name
      >;
      setAgentStatus: FunctionReference<
        "mutation",
        "internal",
        {
          absoluteExpiresAt?: number;
          agentId: string;
          expiresAt?: number;
          operatorUserId: string;
          organizationId: string;
          status: "pending" | "active" | "expired" | "revoked" | "rejected";
        },
        { ok: true },
        Name
      >;
    };
    apiKeys: {
      getApiKey: FunctionReference<
        "query",
        "internal",
        { apiKeyId: string },
        null | {
          _creationTime: number;
          _id: string;
          allowedIpRanges?: Array<string>;
          createdAt: number;
          environment?: "sandbox" | "production";
          expiresAt?: number;
          fixedOrganizationId?: string;
          keyHash: string;
          keyPrefix: string;
          keyStart?: string;
          lastRefillAt?: number;
          lastRequestAt?: number;
          lastUsedAt?: number;
          lastUsedIp?: string;
          metadataJson?: string;
          name: string;
          organizationId?: string;
          ownerId?: string;
          ownerServicePrincipalId?: string;
          ownerType?: "user" | "organization" | "service";
          permissions?: Array<string>;
          rateLimitEnabled?: boolean;
          rateLimitMax?: number;
          rateLimitTimeWindowMs?: number;
          refillAmount?: number;
          refillIntervalMs?: number;
          remaining?: number;
          requestCount?: number;
          requestId?: string;
          requestIdExpiresAt?: number;
          scopes: Array<string>;
          status: "active" | "revoked";
          updatedAt: number;
          userId?: string;
          windowStartedAt?: number;
        },
        Name
      >;
      getApiKeyByPrefix: FunctionReference<
        "query",
        "internal",
        { keyPrefix: string },
        null | {
          _creationTime: number;
          _id: string;
          allowedIpRanges?: Array<string>;
          createdAt: number;
          environment?: "sandbox" | "production";
          expiresAt?: number;
          fixedOrganizationId?: string;
          keyHash: string;
          keyPrefix: string;
          keyStart?: string;
          lastRefillAt?: number;
          lastRequestAt?: number;
          lastUsedAt?: number;
          lastUsedIp?: string;
          metadataJson?: string;
          name: string;
          organizationId?: string;
          ownerId?: string;
          ownerServicePrincipalId?: string;
          ownerType?: "user" | "organization" | "service";
          permissions?: Array<string>;
          rateLimitEnabled?: boolean;
          rateLimitMax?: number;
          rateLimitTimeWindowMs?: number;
          refillAmount?: number;
          refillIntervalMs?: number;
          remaining?: number;
          requestCount?: number;
          requestId?: string;
          requestIdExpiresAt?: number;
          scopes: Array<string>;
          status: "active" | "revoked";
          updatedAt: number;
          userId?: string;
          windowStartedAt?: number;
        },
        Name
      >;
      getApiKeyByRequestId: FunctionReference<
        "query",
        "internal",
        { organizationId: string; requestId: string },
        null | {
          _creationTime: number;
          _id: string;
          allowedIpRanges?: Array<string>;
          createdAt: number;
          environment?: "sandbox" | "production";
          expiresAt?: number;
          fixedOrganizationId?: string;
          keyHash: string;
          keyPrefix: string;
          keyStart?: string;
          lastRefillAt?: number;
          lastRequestAt?: number;
          lastUsedAt?: number;
          lastUsedIp?: string;
          metadataJson?: string;
          name: string;
          organizationId?: string;
          ownerId?: string;
          ownerServicePrincipalId?: string;
          ownerType?: "user" | "organization" | "service";
          permissions?: Array<string>;
          rateLimitEnabled?: boolean;
          rateLimitMax?: number;
          rateLimitTimeWindowMs?: number;
          refillAmount?: number;
          refillIntervalMs?: number;
          remaining?: number;
          requestCount?: number;
          requestId?: string;
          requestIdExpiresAt?: number;
          scopes: Array<string>;
          status: "active" | "revoked";
          updatedAt: number;
          userId?: string;
          windowStartedAt?: number;
        },
        Name
      >;
      issueApiKey: FunctionReference<
        "mutation",
        "internal",
        {
          allowedIpRanges?: Array<string> | null;
          environment: "sandbox" | "production";
          expiresAt?: number;
          keyBrand?: string;
          metadataJson?: string;
          name: string;
          now?: number;
          organizationId: string;
          rateLimitEnabled?: boolean;
          rateLimitMax?: number;
          rateLimitTimeWindowMs?: number;
          refillAmount?: number;
          refillIntervalMs?: number;
          remaining?: number;
          scopes?: Array<string>;
          userId: string;
        },
        {
          apiKey: string;
          apiKeyId: string;
          keyPrefix: string;
          keyStart: string;
        },
        Name
      >;
      issueServiceOwnedApiKey: FunctionReference<
        "mutation",
        "internal",
        {
          allowedIpRanges?: Array<string> | null;
          environment: "sandbox" | "production";
          expiresAt?: number;
          keyBrand?: string;
          metadataJson?: string;
          name: string;
          now?: number;
          permissions?: Array<string> | null;
          rateLimitEnabled?: boolean;
          rateLimitMax?: number;
          rateLimitTimeWindowMs?: number;
          refillAmount?: number;
          refillIntervalMs?: number;
          remaining?: number;
          scopes?: Array<string>;
          servicePrincipalId: string;
        },
        {
          apiKey: string;
          apiKeyId: string;
          keyPrefix: string;
          keyStart: string;
        },
        Name
      >;
      listApiKeysByOrganization: FunctionReference<
        "query",
        "internal",
        {
          limit?: number;
          organizationId: string;
          status?: "active" | "revoked";
        },
        Array<{
          _creationTime: number;
          _id: string;
          allowedIpRanges?: Array<string>;
          createdAt: number;
          environment?: "sandbox" | "production";
          expiresAt?: number;
          fixedOrganizationId?: string;
          keyHash: string;
          keyPrefix: string;
          keyStart?: string;
          lastRefillAt?: number;
          lastRequestAt?: number;
          lastUsedAt?: number;
          lastUsedIp?: string;
          metadataJson?: string;
          name: string;
          organizationId?: string;
          ownerId?: string;
          ownerServicePrincipalId?: string;
          ownerType?: "user" | "organization" | "service";
          permissions?: Array<string>;
          rateLimitEnabled?: boolean;
          rateLimitMax?: number;
          rateLimitTimeWindowMs?: number;
          refillAmount?: number;
          refillIntervalMs?: number;
          remaining?: number;
          requestCount?: number;
          requestId?: string;
          requestIdExpiresAt?: number;
          scopes: Array<string>;
          status: "active" | "revoked";
          updatedAt: number;
          userId?: string;
          windowStartedAt?: number;
        }>,
        Name
      >;
      listApiKeysByServicePrincipal: FunctionReference<
        "query",
        "internal",
        {
          limit?: number;
          servicePrincipalId: string;
          status?: "active" | "revoked";
        },
        Array<{
          _creationTime: number;
          _id: string;
          allowedIpRanges?: Array<string>;
          createdAt: number;
          environment?: "sandbox" | "production";
          expiresAt?: number;
          fixedOrganizationId?: string;
          keyHash: string;
          keyPrefix: string;
          keyStart?: string;
          lastRefillAt?: number;
          lastRequestAt?: number;
          lastUsedAt?: number;
          lastUsedIp?: string;
          metadataJson?: string;
          name: string;
          organizationId?: string;
          ownerId?: string;
          ownerServicePrincipalId?: string;
          ownerType?: "user" | "organization" | "service";
          permissions?: Array<string>;
          rateLimitEnabled?: boolean;
          rateLimitMax?: number;
          rateLimitTimeWindowMs?: number;
          refillAmount?: number;
          refillIntervalMs?: number;
          remaining?: number;
          requestCount?: number;
          requestId?: string;
          requestIdExpiresAt?: number;
          scopes: Array<string>;
          status: "active" | "revoked";
          updatedAt: number;
          userId?: string;
          windowStartedAt?: number;
        }>,
        Name
      >;
      revokeApiKey: FunctionReference<
        "mutation",
        "internal",
        { apiKeyId: string; organizationId: string },
        { ok: true },
        Name
      >;
      rotateApiKey: FunctionReference<
        "mutation",
        "internal",
        {
          apiKeyId: string;
          keyHash: string;
          keyPrefix: string;
          organizationId: string;
        },
        { ok: true },
        Name
      >;
      touchApiKeyLastUsed: FunctionReference<
        "mutation",
        "internal",
        { apiKeyId: string; ip?: string | null; organizationId: string },
        { ok: true },
        Name
      >;
      upsertApiKey: FunctionReference<
        "mutation",
        "internal",
        {
          allowedIpRanges?: Array<string> | null;
          apiKeyId?: string;
          environment?: "sandbox" | "production";
          expiresAt?: number | null;
          keyHash: string;
          keyPrefix: string;
          metadataJson?: string | null;
          name: string;
          organizationId: string;
          requestId?: string | null;
          requestIdExpiresAt?: number | null;
          scopes: Array<string>;
          status?: "active" | "revoked";
          userId: string;
        },
        { apiKeyId: string; created: boolean },
        Name
      >;
      upsertServiceOwnedApiKey: FunctionReference<
        "mutation",
        "internal",
        {
          allowedIpRanges?: Array<string> | null;
          apiKeyId?: string;
          environment?: "sandbox" | "production";
          expiresAt?: number | null;
          keyHash: string;
          keyPrefix: string;
          metadataJson?: string | null;
          name: string;
          permissions?: Array<string> | null;
          requestId?: string | null;
          requestIdExpiresAt?: number | null;
          scopes: Array<string>;
          servicePrincipalId: string;
          status?: "active" | "revoked";
        },
        { apiKeyId: string; created: boolean },
        Name
      >;
      verifyApiKey: FunctionReference<
        "mutation",
        "internal",
        {
          environment?: "sandbox" | "production";
          now?: number;
          presentedKey: string;
          requiredScopes?: Array<string>;
        },
        | {
            apiKeyId: string;
            environment?: "sandbox" | "production";
            organizationId?: string;
            principal: {
              id?: string;
              rateLimitKey: string;
              type: "human" | "service";
            };
            remaining?: number;
            scopes: Array<string>;
            userId?: string;
            valid: true;
          }
        | {
            reason:
              | "malformed"
              | "not_found"
              | "revoked"
              | "expired"
              | "environment_mismatch"
              | "scope_missing"
              | "rate_limited"
              | "quota_exhausted";
            valid: false;
          },
        Name
      >;
    };
    authMd: {
      completeServiceAuthClaim: FunctionReference<
        "mutation",
        "internal",
        {
          claimViewTokenHash: string;
          organizationId: string;
          userCodeHash: string;
          userId: string;
        },
        | { ok: true; status: "claimed" }
        | { ok: false; reason: "invalid_claim" },
        Name
      >;
      consumeServiceAuthAssertion: FunctionReference<
        "mutation",
        "internal",
        { assertionId: string; credentialExpiresInSeconds: number },
        {
          credentialId: string;
          expiresAt: number;
          issuedAt: number;
          organizationId: string;
          registrationId: string;
          resource: string;
          scopes: Array<string>;
          userId: string;
        },
        Name
      >;
      introspectServiceAuthCredential: FunctionReference<
        "query",
        "internal",
        { credentialId: string },
        | { active: false }
        | {
            active: true;
            credentialId: string;
            expiresAt: number;
            organizationId: string;
            registrationId: string;
            resource: string;
            scopes: Array<string>;
            userId: string;
          },
        Name
      >;
      pollServiceAuthClaim: FunctionReference<
        "mutation",
        "internal",
        { claimTokenHash: string },
        | { interval: number; status: "authorization_pending" }
        | { interval: number; status: "slow_down" }
        | { status: "expired_token" }
        | { status: "access_denied" }
        | {
            assertionId: string;
            expiresAt: number;
            issuedAt: number;
            organizationId: string;
            registrationId: string;
            resource: string;
            scopes: Array<string>;
            status: "claimed";
            userId: string;
          },
        Name
      >;
      refreshServiceAuthCredential: FunctionReference<
        "mutation",
        "internal",
        { credentialExpiresInSeconds: number; credentialId: string },
        {
          credentialId: string;
          expiresAt: number;
          issuedAt: number;
          organizationId: string;
          registrationId: string;
          resource: string;
          scopes: Array<string>;
          userId: string;
        },
        Name
      >;
      registerServiceAuth: FunctionReference<
        "mutation",
        "internal",
        {
          claimTokenHash: string;
          claimViewTokenHash: string;
          expiresAt: number;
          loginHintHash: string;
          pollIntervalSeconds: number;
          resource: string;
          scopes: Array<string>;
          userCodeExpiresAt: number;
          userCodeHash: string;
        },
        { registrationId: string },
        Name
      >;
      revokeServiceAuthCredentialAsHolder: FunctionReference<
        "mutation",
        "internal",
        { credentialId: string },
        { ok: true },
        Name
      >;
      revokeServiceAuthRegistration: FunctionReference<
        "mutation",
        "internal",
        { actorUserId: string; registrationId: string },
        { ok: true },
        Name
      >;
    };
    identity: {
      changeEmail: FunctionReference<
        "mutation",
        "internal",
        { newEmail: string; tokenHash: string },
        {
          reason?: string;
          status: boolean;
          user?: {
            _id: string;
            activeOrganizationId?: string;
            createdAt: number;
            email?: string;
            emailTwoFactorDisabledAt?: number;
            emailTwoFactorEmail?: string;
            emailTwoFactorEnabledAt?: number;
            emailTwoFactorLastVerifiedAt?: number;
            emailTwoFactorResetAt?: number;
            emailTwoFactorResetReason?:
              "missing_email" | "email_not_verified" | "email_changed";
            emailTwoFactorStatus?: "disabled" | "enabled" | "reset_required";
            emailVerified: boolean;
            image?: string;
            isActive: boolean;
            isSuperAdmin?: boolean;
            metadataJson?: string;
            name?: string;
            twoFactorEnabled?: boolean;
            updatedAt: number;
          };
        },
        Name
      >;
      getByIdentity: FunctionReference<
        "query",
        "internal",
        { issuer: string; provider: string; subject: string },
        {
          email?: string;
          emailVerified: boolean;
          identityId: string;
          identityKey: string;
          userId: string;
        } | null,
        Name
      >;
      getByTokenIdentifier: FunctionReference<
        "query",
        "internal",
        { tokenIdentifier: string },
        {
          email?: string;
          emailVerified: boolean;
          identityId: string;
          identityKey: string;
          userId: string;
        } | null,
        Name
      >;
      getUserAndAccount: FunctionReference<
        "query",
        "internal",
        { email: string },
        null | {
          account: {
            _id: string;
            credentialHash: string;
            issuer: string;
            provider: string;
            subject: string;
            userId: string;
          };
          identity: {
            _id: string;
            email?: string;
            emailVerified: boolean;
            issuer: string;
            provider: string;
            subject: string;
            userId: string;
          };
          user: {
            _id: string;
            activeOrganizationId?: string;
            createdAt: number;
            email?: string;
            emailTwoFactorDisabledAt?: number;
            emailTwoFactorEmail?: string;
            emailTwoFactorEnabledAt?: number;
            emailTwoFactorLastVerifiedAt?: number;
            emailTwoFactorResetAt?: number;
            emailTwoFactorResetReason?:
              "missing_email" | "email_not_verified" | "email_changed";
            emailTwoFactorStatus?: "disabled" | "enabled" | "reset_required";
            emailVerified: boolean;
            image?: string;
            isActive: boolean;
            isSuperAdmin?: boolean;
            metadataJson?: string;
            name?: string;
            twoFactorEnabled?: boolean;
            updatedAt: number;
          };
        },
        Name
      >;
      listByUser: FunctionReference<
        "query",
        "internal",
        {
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          userId: string;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            email?: string;
            emailVerified: boolean;
            identityId: string;
            issuer: string;
            provider: string;
            subject: string;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        },
        Name
      >;
      provisionFromIdentity: FunctionReference<
        "mutation",
        "internal",
        {
          account?: { credentialHash: string };
          allowLink?: boolean;
          identity: {
            email?: string;
            emailVerified: boolean;
            identityId: string;
            issuer: string;
            provider: string;
            sessionId?: string | null;
            subject: string;
            tokenIdentifier: string;
          };
          initialSession?: {
            refreshTokenExpiresAt: number;
            refreshTokenHash: string;
            sessionExpiresAt: number;
            sessionId: string;
          };
          user: {
            email?: string;
            emailVerified: boolean;
            image?: string;
            name?: string;
          };
          verificationCode?: { expiresAt: number; tokenHash: string };
        },
        {
          createdUser: boolean;
          duplicate?: boolean;
          identityId?: string;
          linkedExistingIdentity: boolean;
          sessionId?: string;
          token?: string;
          user?: {
            _id: string;
            activeOrganizationId?: string;
            createdAt: number;
            email?: string;
            emailTwoFactorDisabledAt?: number;
            emailTwoFactorEmail?: string;
            emailTwoFactorEnabledAt?: number;
            emailTwoFactorLastVerifiedAt?: number;
            emailTwoFactorResetAt?: number;
            emailTwoFactorResetReason?:
              "missing_email" | "email_not_verified" | "email_changed";
            emailTwoFactorStatus?: "disabled" | "enabled" | "reset_required";
            emailVerified: boolean;
            image?: string;
            isActive: boolean;
            isSuperAdmin?: boolean;
            metadataJson?: string;
            name?: string;
            twoFactorEnabled?: boolean;
            updatedAt: number;
          };
          userId: string;
        },
        Name
      >;
      resetPassword: FunctionReference<
        "mutation",
        "internal",
        {
          credentialHash: string;
          issuer: string;
          provider: string;
          revokeSessions?: boolean;
          tokenHash: string;
        },
        {
          reason?: string;
          status: boolean;
          user?: {
            _id: string;
            activeOrganizationId?: string;
            createdAt: number;
            email?: string;
            emailTwoFactorDisabledAt?: number;
            emailTwoFactorEmail?: string;
            emailTwoFactorEnabledAt?: number;
            emailTwoFactorLastVerifiedAt?: number;
            emailTwoFactorResetAt?: number;
            emailTwoFactorResetReason?:
              "missing_email" | "email_not_verified" | "email_changed";
            emailTwoFactorStatus?: "disabled" | "enabled" | "reset_required";
            emailVerified: boolean;
            image?: string;
            isActive: boolean;
            isSuperAdmin?: boolean;
            metadataJson?: string;
            name?: string;
            twoFactorEnabled?: boolean;
            updatedAt: number;
          };
        },
        Name
      >;
      verifyEmail: FunctionReference<
        "mutation",
        "internal",
        { issuer: string; provider: string; tokenHash: string },
        {
          reason?: string;
          success: boolean;
          user?: {
            _id: string;
            activeOrganizationId?: string;
            createdAt: number;
            email?: string;
            emailTwoFactorDisabledAt?: number;
            emailTwoFactorEmail?: string;
            emailTwoFactorEnabledAt?: number;
            emailTwoFactorLastVerifiedAt?: number;
            emailTwoFactorResetAt?: number;
            emailTwoFactorResetReason?:
              "missing_email" | "email_not_verified" | "email_changed";
            emailTwoFactorStatus?: "disabled" | "enabled" | "reset_required";
            emailVerified: boolean;
            image?: string;
            isActive: boolean;
            isSuperAdmin?: boolean;
            metadataJson?: string;
            name?: string;
            twoFactorEnabled?: boolean;
            updatedAt: number;
          };
        },
        Name
      >;
    };
    mcp: {
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
    native: {
      accounts: {
        createAccount: FunctionReference<
          "mutation",
          "internal",
          {
            accessToken?: string;
            accessTokenExpiresAt?: number;
            credentialHash: string;
            idToken?: string;
            issuer: string;
            provider: string;
            refreshToken?: string;
            refreshTokenExpiresAt?: number;
            scopes?: Array<string>;
            subject: string;
            tokenType?: string;
            userId: string;
          },
          any,
          Name
        >;
        getAccountBySubject: FunctionReference<
          "query",
          "internal",
          { issuer: string; provider: string; subject: string },
          any,
          Name
        >;
        updateAccountTokens: FunctionReference<
          "mutation",
          "internal",
          {
            accessToken?: string;
            accessTokenExpiresAt?: number;
            accountId: string;
            idToken?: string;
            refreshToken?: string;
            refreshTokenExpiresAt?: number;
            scopes?: Array<string>;
            tokenType?: string;
          },
          any,
          Name
        >;
        updateCredentialHash: FunctionReference<
          "mutation",
          "internal",
          { accountId: string; credentialHash: string },
          any,
          Name
        >;
      };
      audit: {
        cleanupAuthAuditEvents: FunctionReference<
          "mutation",
          "internal",
          { batchSize?: number; maxAgeMs: number },
          number,
          Name
        >;
        createAuthAuditEvent: FunctionReference<
          "mutation",
          "internal",
          {
            actorType: "anonymous" | "user" | "machine" | "service" | "system";
            actorUserId?: string;
            eventType: string;
            metadataJson?: string;
            organizationId?: string;
            targetId?: string;
            targetType: string;
          },
          string,
          Name
        >;
        listAuthAuditEvents: FunctionReference<
          "query",
          "internal",
          { limit?: number; organizationId?: string },
          Array<{
            _id: string;
            action: string;
            actor?: null | { _id: string; email: string; name?: string };
            createdAt: number;
            description?: string;
            ipAddress?: string;
            newValue?: string;
            oldValue?: string;
            resourceType?: string;
            targetUserEmail?: string;
            userAgent?: string;
            userEmail?: string;
            userName?: string;
          }>,
          Name
        >;
      };
      codes: {
        cleanupVerificationCodes: FunctionReference<
          "mutation",
          "internal",
          {
            maxAgeMs?: number;
            type?:
              | "email_verification"
              | "password_reset"
              | "email_change"
              | "two_factor_pending"
              | "two_factor_trusted_device";
            userId: string;
          },
          number,
          Name
        >;
        consumeVerificationCode: FunctionReference<
          "mutation",
          "internal",
          {
            tokenHash: string;
            type:
              | "email_verification"
              | "password_reset"
              | "email_change"
              | "two_factor_pending"
              | "two_factor_trusted_device";
          },
          any,
          Name
        >;
        createVerificationCode: FunctionReference<
          "mutation",
          "internal",
          {
            expiresAt: number;
            tokenHash: string;
            type:
              | "email_verification"
              | "password_reset"
              | "email_change"
              | "two_factor_pending"
              | "two_factor_trusted_device";
            userId: string;
          },
          any,
          Name
        >;
        getVerificationCodeByTokenHash: FunctionReference<
          "query",
          "internal",
          {
            tokenHash: string;
            type:
              | "email_verification"
              | "password_reset"
              | "email_change"
              | "two_factor_pending"
              | "two_factor_trusted_device";
          },
          any,
          Name
        >;
        revokeVerificationCodesForUser: FunctionReference<
          "mutation",
          "internal",
          {
            type:
              | "email_verification"
              | "password_reset"
              | "email_change"
              | "two_factor_pending"
              | "two_factor_trusted_device";
            userId: string;
          },
          any,
          Name
        >;
      };
      identities: {
        getNativeIdentityByUser: FunctionReference<
          "query",
          "internal",
          { issuer: string; provider: string; userId: string },
          any,
          Name
        >;
        markEmailVerified: FunctionReference<
          "mutation",
          "internal",
          { emailVerified: boolean; identityId: string },
          any,
          Name
        >;
      };
      rateLimits: {
        checkRateLimit: FunctionReference<
          "query",
          "internal",
          {
            identifier: string;
            maxAttempts: number;
            windowMs: number;
            windowStart: number;
          },
          { allowed: boolean; count: number },
          Name
        >;
        cleanupExpiredRateLimits: FunctionReference<
          "mutation",
          "internal",
          { before: number },
          number,
          Name
        >;
        recordAttempt: FunctionReference<
          "mutation",
          "internal",
          {
            identifier: string;
            maxAttempts: number;
            windowMs: number;
            windowStart: number;
          },
          { allowed: boolean; count: number },
          Name
        >;
      };
      refreshTokens: {
        cleanupExpiredRefreshTokens: FunctionReference<
          "mutation",
          "internal",
          { batchSize?: number; before?: number },
          number,
          Name
        >;
        consumeRefreshToken: FunctionReference<
          "mutation",
          "internal",
          { tokenHash: string },
          null | {
            _creationTime: number;
            _id: string;
            createdAt: number;
            expiresAt: number;
            revokedAt?: number;
            sessionId: string;
            tokenHash: string;
            updatedAt: number;
            userId: string;
          },
          Name
        >;
        createRefreshToken: FunctionReference<
          "mutation",
          "internal",
          {
            expiresAt: number;
            sessionId: string;
            tokenHash: string;
            userId: string;
          },
          string,
          Name
        >;
        getRefreshTokenByTokenHash: FunctionReference<
          "query",
          "internal",
          { tokenHash: string },
          null | {
            _creationTime: number;
            _id: string;
            createdAt: number;
            expiresAt: number;
            revokedAt?: number;
            sessionId: string;
            tokenHash: string;
            updatedAt: number;
            userId: string;
          },
          Name
        >;
        revokeRefreshTokensForSession: FunctionReference<
          "mutation",
          "internal",
          { sessionId: string },
          number,
          Name
        >;
        revokeRefreshTokensForUser: FunctionReference<
          "mutation",
          "internal",
          { userId: string },
          number,
          Name
        >;
      };
      sessions: {
        cleanupExpiredSessions: FunctionReference<
          "mutation",
          "internal",
          { batchSize?: number; before?: number },
          number,
          Name
        >;
        createSession: FunctionReference<
          "mutation",
          "internal",
          {
            expiresAt: number;
            sessionId: string;
            token: string;
            userId: string;
          },
          any,
          Name
        >;
        createSessionAndRefreshToken: FunctionReference<
          "mutation",
          "internal",
          {
            refreshTokenExpiresAt: number;
            refreshTokenHash: string;
            sessionExpiresAt: number;
            sessionId: string;
            token: string;
            userId: string;
          },
          string,
          Name
        >;
        getSessionBySessionId: FunctionReference<
          "query",
          "internal",
          { sessionId: string },
          any,
          Name
        >;
        getSessionByToken: FunctionReference<
          "query",
          "internal",
          { token: string },
          any,
          Name
        >;
        listSessionsByUser: FunctionReference<
          "query",
          "internal",
          { userId: string },
          any,
          Name
        >;
        revokeSession: FunctionReference<
          "mutation",
          "internal",
          { sessionId: string },
          any,
          Name
        >;
        revokeSessionsForUser: FunctionReference<
          "mutation",
          "internal",
          { excludeSessionId?: string; userId: string },
          any,
          Name
        >;
        rotateSession: FunctionReference<
          "mutation",
          "internal",
          {
            issuer: string;
            newRefreshTokenExpiresAt: number;
            newRefreshTokenHash: string;
            newSessionExpiresAt: number;
            newSessionId: string;
            newSessionIpAddress?: string;
            newSessionToken: string;
            newSessionUserAgent?: string;
            oldRefreshTokenHash: string;
            provider: string;
          },
          null | {
            identityId: string;
            user: {
              _id: string;
              createdAt: number;
              email?: string;
              emailVerified: boolean;
              image?: string;
              name?: string;
              updatedAt: number;
            };
          },
          Name
        >;
      };
      users: {
        consumeBackupCode: FunctionReference<
          "mutation",
          "internal",
          { backupCodeHash: string; userId: string },
          { success: boolean },
          Name
        >;
        deleteUser: FunctionReference<
          "mutation",
          "internal",
          { userId: string },
          { deleted: boolean; userId: string },
          Name
        >;
        getUserByEmail: FunctionReference<
          "query",
          "internal",
          { email: string },
          any,
          Name
        >;
        getUserById: FunctionReference<
          "query",
          "internal",
          { userId: string },
          any,
          Name
        >;
        markEmailVerified: FunctionReference<
          "mutation",
          "internal",
          { emailVerified: boolean; userId: string },
          any,
          Name
        >;
        setTwoFactor: FunctionReference<
          "mutation",
          "internal",
          {
            twoFactorBackupCodes?: Array<string>;
            twoFactorEnabled: boolean;
            twoFactorSecret?: string;
            userId: string;
          },
          any,
          Name
        >;
        updateUser: FunctionReference<
          "mutation",
          "internal",
          {
            image?: string;
            metadataJson?: string;
            name?: string;
            userId: string;
          },
          any,
          Name
        >;
      };
      verifiers: {
        consumeVerifier: FunctionReference<
          "mutation",
          "internal",
          { verifierId: string },
          null | {
            _creationTime: number;
            _id: string;
            codeChallenge?: string;
            codeChallengeMethod?: string;
            consumedAt?: number;
            createdAt: number;
            expiresAt: number;
            metadata?: string;
            provider?: string;
            redirectUri?: string;
            type: string;
            updatedAt: number;
            verifierId: string;
          },
          Name
        >;
        createVerifier: FunctionReference<
          "mutation",
          "internal",
          {
            codeChallenge?: string;
            codeChallengeMethod?: string;
            expiresAt: number;
            metadata?: string;
            provider?: string;
            redirectUri?: string;
            type: string;
            verifierId: string;
          },
          string,
          Name
        >;
        getVerifierByVerifierId: FunctionReference<
          "query",
          "internal",
          { verifierId: string },
          null | {
            _creationTime: number;
            _id: string;
            codeChallenge?: string;
            codeChallengeMethod?: string;
            consumedAt?: number;
            createdAt: number;
            expiresAt: number;
            metadata?: string;
            provider?: string;
            redirectUri?: string;
            type: string;
            updatedAt: number;
            verifierId: string;
          },
          Name
        >;
      };
    };
    organizations: {
      deleteRole: FunctionReference<
        "mutation",
        "internal",
        { organizationId: string; roleId: string },
        { ok: true },
        Name
      >;
      ensureRole: FunctionReference<
        "mutation",
        "internal",
        {
          createdBy?: string;
          description?: string | null;
          isSystem?: boolean;
          key: string;
          name: string;
          organizationId: string;
          permissions: Array<string>;
        },
        { created: boolean; roleId: string },
        Name
      >;
      getInvitation: FunctionReference<
        "query",
        "internal",
        { invitationId: string; organizationId: string },
        null | {
          _creationTime: number;
          _id: string;
          acceptedAt?: number;
          acceptedByUserId?: string;
          createdAt: number;
          email: string;
          emailDeliveryError?: string;
          emailDeliveryEvent?: string;
          emailDeliveryStatus?:
            | "not_configured"
            | "queued"
            | "sent"
            | "delivered"
            | "delivery_delayed"
            | "bounced"
            | "failed";
          emailDeliveryUpdatedAt?: number;
          emailId?: string;
          expiresAt: number;
          invitedBy: string;
          metadataJson?: string;
          organizationId: string;
          revokedAt?: number;
          roleId: string;
          status: "pending" | "accepted" | "revoked" | "expired";
          tokenHash: string;
          updatedAt: number;
        },
        Name
      >;
      getInvitationByEmailId: FunctionReference<
        "query",
        "internal",
        { emailId: string },
        null | {
          _creationTime: number;
          _id: string;
          acceptedAt?: number;
          acceptedByUserId?: string;
          createdAt: number;
          email: string;
          emailDeliveryError?: string;
          emailDeliveryEvent?: string;
          emailDeliveryStatus?:
            | "not_configured"
            | "queued"
            | "sent"
            | "delivered"
            | "delivery_delayed"
            | "bounced"
            | "failed";
          emailDeliveryUpdatedAt?: number;
          emailId?: string;
          expiresAt: number;
          invitedBy: string;
          metadataJson?: string;
          organizationId: string;
          revokedAt?: number;
          roleId: string;
          status: "pending" | "accepted" | "revoked" | "expired";
          tokenHash: string;
          updatedAt: number;
        },
        Name
      >;
      getInvitationByIdForSystem: FunctionReference<
        "query",
        "internal",
        { invitationId: string },
        null | {
          _creationTime: number;
          _id: string;
          acceptedAt?: number;
          acceptedByUserId?: string;
          createdAt: number;
          email: string;
          emailDeliveryError?: string;
          emailDeliveryEvent?: string;
          emailDeliveryStatus?:
            | "not_configured"
            | "queued"
            | "sent"
            | "delivered"
            | "delivery_delayed"
            | "bounced"
            | "failed";
          emailDeliveryUpdatedAt?: number;
          emailId?: string;
          expiresAt: number;
          invitedBy: string;
          metadataJson?: string;
          organizationId: string;
          revokedAt?: number;
          roleId: string;
          status: "pending" | "accepted" | "revoked" | "expired";
          tokenHash: string;
          updatedAt: number;
        },
        Name
      >;
      getInvitationByTokenHash: FunctionReference<
        "query",
        "internal",
        { tokenHash: string },
        null | {
          _creationTime: number;
          _id: string;
          acceptedAt?: number;
          acceptedByUserId?: string;
          createdAt: number;
          email: string;
          emailDeliveryError?: string;
          emailDeliveryEvent?: string;
          emailDeliveryStatus?:
            | "not_configured"
            | "queued"
            | "sent"
            | "delivered"
            | "delivery_delayed"
            | "bounced"
            | "failed";
          emailDeliveryUpdatedAt?: number;
          emailId?: string;
          expiresAt: number;
          invitedBy: string;
          metadataJson?: string;
          organizationId: string;
          revokedAt?: number;
          roleId: string;
          status: "pending" | "accepted" | "revoked" | "expired";
          tokenHash: string;
          updatedAt: number;
        },
        Name
      >;
      getInvitedMemberByEmail: FunctionReference<
        "query",
        "internal",
        { invitedEmail: string; organizationId: string },
        null | {
          _creationTime: number;
          _id: string;
          acceptedAt?: number;
          assignedBy?: string;
          createdAt: number;
          invitedAt?: number;
          invitedBy?: string;
          invitedEmail?: string;
          organizationId: string;
          roleId: string;
          status: "active" | "invited" | "suspended";
          updatedAt: number;
          userId?: string;
        },
        Name
      >;
      getMember: FunctionReference<
        "query",
        "internal",
        { memberId: string; organizationId: string },
        null | {
          _creationTime: number;
          _id: string;
          acceptedAt?: number;
          assignedBy?: string;
          createdAt: number;
          invitedAt?: number;
          invitedBy?: string;
          invitedEmail?: string;
          organizationId: string;
          roleId: string;
          status: "active" | "invited" | "suspended";
          updatedAt: number;
          userId?: string;
        },
        Name
      >;
      getMemberByIdForSystem: FunctionReference<
        "query",
        "internal",
        { memberId: string },
        null | {
          _creationTime: number;
          _id: string;
          acceptedAt?: number;
          assignedBy?: string;
          createdAt: number;
          invitedAt?: number;
          invitedBy?: string;
          invitedEmail?: string;
          organizationId: string;
          roleId: string;
          status: "active" | "invited" | "suspended";
          updatedAt: number;
          userId?: string;
        },
        Name
      >;
      getMemberByUserOrganization: FunctionReference<
        "query",
        "internal",
        { organizationId: string; userId: string },
        null | {
          _creationTime: number;
          _id: string;
          acceptedAt?: number;
          assignedBy?: string;
          createdAt: number;
          invitedAt?: number;
          invitedBy?: string;
          invitedEmail?: string;
          organizationId: string;
          roleId: string;
          status: "active" | "invited" | "suspended";
          updatedAt: number;
          userId?: string;
        },
        Name
      >;
      getOrganization: FunctionReference<
        "query",
        "internal",
        { organizationId: string },
        null | {
          _creationTime: number;
          _id: string;
          createdAt: number;
          createdBy?: string;
          imageUrl?: string;
          metadataJson?: string;
          name: string;
          slug: string;
          status: "active" | "suspended" | "deleted";
          updatedAt: number;
        },
        Name
      >;
      getOrganizationBySlug: FunctionReference<
        "query",
        "internal",
        { slug: string },
        null | {
          _creationTime: number;
          _id: string;
          createdAt: number;
          createdBy?: string;
          imageUrl?: string;
          metadataJson?: string;
          name: string;
          slug: string;
          status: "active" | "suspended" | "deleted";
          updatedAt: number;
        },
        Name
      >;
      getRole: FunctionReference<
        "query",
        "internal",
        { organizationId: string; roleId: string },
        null | {
          _creationTime: number;
          _id: string;
          createdAt: number;
          createdBy?: string;
          description?: string;
          isSystem: boolean;
          key: string;
          name: string;
          organizationId: string;
          permissions: Array<string>;
          updatedAt: number;
        },
        Name
      >;
      getRoleByKey: FunctionReference<
        "query",
        "internal",
        { key: string; organizationId: string },
        null | {
          _creationTime: number;
          _id: string;
          createdAt: number;
          createdBy?: string;
          description?: string;
          isSystem: boolean;
          key: string;
          name: string;
          organizationId: string;
          permissions: Array<string>;
          updatedAt: number;
        },
        Name
      >;
      listInvitationsByOrganization: FunctionReference<
        "query",
        "internal",
        {
          limit?: number;
          organizationId: string;
          status?: "pending" | "accepted" | "revoked" | "expired";
        },
        Array<{
          _creationTime: number;
          _id: string;
          acceptedAt?: number;
          acceptedByUserId?: string;
          createdAt: number;
          email: string;
          emailDeliveryError?: string;
          emailDeliveryEvent?: string;
          emailDeliveryStatus?:
            | "not_configured"
            | "queued"
            | "sent"
            | "delivered"
            | "delivery_delayed"
            | "bounced"
            | "failed";
          emailDeliveryUpdatedAt?: number;
          emailId?: string;
          expiresAt: number;
          invitedBy: string;
          metadataJson?: string;
          organizationId: string;
          revokedAt?: number;
          roleId: string;
          status: "pending" | "accepted" | "revoked" | "expired";
          tokenHash: string;
          updatedAt: number;
        }>,
        Name
      >;
      listMembersByOrganization: FunctionReference<
        "query",
        "internal",
        {
          limit?: number;
          organizationId: string;
          status?: "active" | "invited" | "suspended";
        },
        Array<{
          _creationTime: number;
          _id: string;
          acceptedAt?: number;
          assignedBy?: string;
          createdAt: number;
          invitedAt?: number;
          invitedBy?: string;
          invitedEmail?: string;
          organizationId: string;
          roleId: string;
          status: "active" | "invited" | "suspended";
          updatedAt: number;
          userId?: string;
        }>,
        Name
      >;
      listMembershipsByUser: FunctionReference<
        "query",
        "internal",
        {
          limit?: number;
          status?: "active" | "invited" | "suspended";
          userId: string;
        },
        Array<{
          _creationTime: number;
          _id: string;
          acceptedAt?: number;
          assignedBy?: string;
          createdAt: number;
          invitedAt?: number;
          invitedBy?: string;
          invitedEmail?: string;
          organizationId: string;
          roleId: string;
          status: "active" | "invited" | "suspended";
          updatedAt: number;
          userId?: string;
        }>,
        Name
      >;
      listOrganizations: FunctionReference<
        "query",
        "internal",
        { limit?: number; status?: "active" | "suspended" | "deleted" },
        Array<{
          _creationTime: number;
          _id: string;
          createdAt: number;
          createdBy?: string;
          imageUrl?: string;
          metadataJson?: string;
          name: string;
          slug: string;
          status: "active" | "suspended" | "deleted";
          updatedAt: number;
        }>,
        Name
      >;
      listRolesByOrganization: FunctionReference<
        "query",
        "internal",
        { limit?: number; organizationId: string },
        Array<{
          _creationTime: number;
          _id: string;
          createdAt: number;
          createdBy?: string;
          description?: string;
          isSystem: boolean;
          key: string;
          name: string;
          organizationId: string;
          permissions: Array<string>;
          updatedAt: number;
        }>,
        Name
      >;
      recordInvitationEmailDelivery: FunctionReference<
        "mutation",
        "internal",
        {
          emailDeliveryError?: string | null;
          emailDeliveryEvent?: string | null;
          emailDeliveryStatus:
            | "not_configured"
            | "queued"
            | "sent"
            | "delivered"
            | "delivery_delayed"
            | "bounced"
            | "failed";
          emailId?: string | null;
          invitationId: string;
          organizationId: string;
        },
        { ok: true },
        Name
      >;
      redeemInvitation: FunctionReference<
        "mutation",
        "internal",
        {
          acceptedAt?: number;
          acceptedByUserId: string;
          assignedBy?: string;
          invitationId?: string;
          tokenHash?: string;
        },
        { accepted: boolean; invitationId: string; memberId: string },
        Name
      >;
      resendInvitation: FunctionReference<
        "mutation",
        "internal",
        {
          emailDeliveryError?: string | null;
          emailDeliveryEvent?: string | null;
          emailDeliveryStatus?:
            | "not_configured"
            | "queued"
            | "sent"
            | "delivered"
            | "delivery_delayed"
            | "bounced"
            | "failed";
          emailId?: string | null;
          expiresAt?: number;
          invitationId: string;
        },
        { ok: true },
        Name
      >;
      revokeInvitation: FunctionReference<
        "mutation",
        "internal",
        { invitationId: string; revokedAt?: number },
        { ok: true },
        Name
      >;
      seedDefaultRoles: FunctionReference<
        "mutation",
        "internal",
        {
          catalog?: Array<{
            description?: string;
            isSystem?: boolean;
            key: string;
            name: string;
            permissions: Array<string>;
          }>;
          createdBy?: string;
          organizationId: string;
        },
        { roleIds: Array<string>; seeded: number },
        Name
      >;
      setInvitationStatus: FunctionReference<
        "mutation",
        "internal",
        {
          acceptedAt?: number;
          acceptedByUserId?: string;
          invitationId: string;
          organizationId: string;
          revokedAt?: number;
          status: "pending" | "accepted" | "revoked" | "expired";
        },
        { ok: true },
        Name
      >;
      setMemberRole: FunctionReference<
        "mutation",
        "internal",
        {
          assignedBy?: string;
          memberId: string;
          organizationId: string;
          roleId: string;
        },
        { ok: true },
        Name
      >;
      setMemberStatus: FunctionReference<
        "mutation",
        "internal",
        {
          acceptedAt?: number;
          memberId: string;
          status: "active" | "invited" | "suspended";
        },
        { ok: true },
        Name
      >;
      setOrganizationDetails: FunctionReference<
        "mutation",
        "internal",
        {
          brand?: {
            accentColor?: string | null;
            emailFromName?: string | null;
            emailReplyTo?: string | null;
            primaryColor?: string | null;
            website?: string | null;
          };
          imageUrl?: string | null;
          metadataJson?: string | null;
          name?: string;
          organizationId: string;
          security?: {
            requireMfa?: boolean | null;
            sessionTimeoutMinutes?: number | null;
          };
          slug?: string;
        },
        { ok: true },
        Name
      >;
      setOrganizationStatus: FunctionReference<
        "mutation",
        "internal",
        { organizationId: string; status: "active" | "suspended" | "deleted" },
        { ok: true },
        Name
      >;
      setRoleDetails: FunctionReference<
        "mutation",
        "internal",
        {
          description?: string | null;
          isSystem?: boolean;
          name?: string;
          permissions?: Array<string>;
          roleId: string;
        },
        { ok: true },
        Name
      >;
      setUserActiveOrganization: FunctionReference<
        "mutation",
        "internal",
        {
          organizationId: string | null;
          twoFactorEnabled?: boolean;
          userId: string;
        },
        { ok: true },
        Name
      >;
      upsertInvitation: FunctionReference<
        "mutation",
        "internal",
        {
          acceptedAt?: number;
          acceptedByUserId?: string;
          email: string;
          emailDeliveryError?: string | null;
          emailDeliveryEvent?: string | null;
          emailDeliveryStatus?:
            | "not_configured"
            | "queued"
            | "sent"
            | "delivered"
            | "delivery_delayed"
            | "bounced"
            | "failed";
          emailDeliveryUpdatedAt?: number;
          emailId?: string | null;
          expiresAt: number;
          invitationId?: string;
          invitedBy: string;
          metadataJson?: string | null;
          organizationId: string;
          revokedAt?: number;
          roleId: string;
          status?: "pending" | "accepted" | "revoked" | "expired";
          tokenHash: string;
        },
        { created: boolean; invitationId: string },
        Name
      >;
      upsertMember: FunctionReference<
        "mutation",
        "internal",
        {
          acceptedAt?: number;
          assignedBy?: string;
          invitedAt?: number;
          invitedBy?: string;
          invitedEmail?: string | null;
          organizationId: string;
          roleId: string;
          status?: "active" | "invited" | "suspended";
          userId?: string;
        },
        { created: boolean; memberId: string },
        Name
      >;
      upsertOrganization: FunctionReference<
        "mutation",
        "internal",
        {
          createdBy?: string;
          imageUrl?: string | null;
          metadataJson?: string | null;
          name: string;
          organizationId?: string;
          slug: string;
          status?: "active" | "suspended" | "deleted";
        },
        { created: boolean; organizationId: string },
        Name
      >;
    };
    passkeys: {
      generatePasskeyAuthenticationOptions: FunctionReference<
        "mutation",
        "internal",
        {
          credentialId?: string;
          rpID: string;
          userId?: string;
          userVerification?: "required" | "preferred" | "discouraged";
        },
        Record<string, any>,
        Name
      >;
      generatePasskeyRegistrationOptions: FunctionReference<
        "mutation",
        "internal",
        {
          authenticatorAttachment?: "platform" | "cross-platform";
          displayName?: string;
          identifier: string;
          rpID: string;
          rpName: string;
          userId: string;
          userVerification?: "required" | "preferred" | "discouraged";
        },
        any,
        Name
      >;
      listPasskeys: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          createdAt: number;
          credentialId: string;
          lastUsedAt: number;
          name?: string;
          revoked: boolean;
        }>,
        Name
      >;
      revokePasskey: FunctionReference<
        "mutation",
        "internal",
        { credentialId: string },
        boolean,
        Name
      >;
      verifyPasskeyAuthentication: FunctionReference<
        "mutation",
        "internal",
        {
          challenge: string;
          origin: string;
          response: {
            clientExtensionResults?: Record<string, any>;
            id: string;
            rawId: string;
            response: {
              authenticatorData: string;
              clientDataJSON: string;
              signature: string;
              userHandle?: string;
            };
            type?: string;
          };
          rpID: string;
        },
        {
          expiresAt: number;
          identityId?: string;
          refreshToken: string;
          sessionId: string;
          token: string;
          userId: string;
        },
        Name
      >;
      verifyPasskeyRegistration: FunctionReference<
        "mutation",
        "internal",
        {
          challenge: string;
          identifier: string;
          name?: string;
          origin: string;
          response: {
            authenticatorAttachment?: string;
            clientExtensionResults?: Record<string, any>;
            id: string;
            rawId: string;
            response: {
              attestationObject: string;
              authenticatorData?: string;
              clientDataJSON: string;
              publicKey?: string;
              publicKeyAlgorithm?: number;
              transports?: Array<string>;
            };
            type?: string;
          };
          rpID: string;
          userId: string;
        },
        { credentialId: string; userId: string },
        Name
      >;
    };
    servicePrincipals: {
      getServicePrincipal: FunctionReference<
        "query",
        "internal",
        { servicePrincipalId: string },
        null | {
          _creationTime: number;
          _id: string;
          createdAt: number;
          createdBy?: string;
          description?: string;
          key: string;
          metadataJson?: string;
          name: string;
          organizationId?: string;
          permissions: Array<string>;
          status: "active" | "disabled";
          updatedAt: number;
        },
        Name
      >;
      getServicePrincipalByKey: FunctionReference<
        "query",
        "internal",
        { key: string },
        null | {
          _creationTime: number;
          _id: string;
          createdAt: number;
          createdBy?: string;
          description?: string;
          key: string;
          metadataJson?: string;
          name: string;
          organizationId?: string;
          permissions: Array<string>;
          status: "active" | "disabled";
          updatedAt: number;
        },
        Name
      >;
      listServicePrincipals: FunctionReference<
        "query",
        "internal",
        {
          limit?: number;
          organizationId?: string;
          status?: "active" | "disabled";
        },
        Array<{
          _creationTime: number;
          _id: string;
          createdAt: number;
          createdBy?: string;
          description?: string;
          key: string;
          metadataJson?: string;
          name: string;
          organizationId?: string;
          permissions: Array<string>;
          status: "active" | "disabled";
          updatedAt: number;
        }>,
        Name
      >;
      setServicePrincipalDetails: FunctionReference<
        "mutation",
        "internal",
        {
          actingOrganizationId: string;
          description?: string | null;
          metadataJson?: string | null;
          name?: string;
          organizationId?: string | null;
          permissions?: Array<string>;
          servicePrincipalId: string;
        },
        { ok: true },
        Name
      >;
      setServicePrincipalStatus: FunctionReference<
        "mutation",
        "internal",
        {
          actingOrganizationId: string;
          servicePrincipalId: string;
          status: "active" | "disabled";
        },
        { ok: true },
        Name
      >;
      upsertServicePrincipal: FunctionReference<
        "mutation",
        "internal",
        {
          createdBy?: string;
          description?: string | null;
          key: string;
          metadataJson?: string | null;
          name: string;
          organizationId?: string | null;
          permissions: Array<string>;
          servicePrincipalId?: string;
          status?: "active" | "disabled";
        },
        { created: boolean; servicePrincipalId: string },
        Name
      >;
    };
    status: {
      get: FunctionReference<
        "query",
        "internal",
        {},
        { component: "convexAuth"; schemaVersion: number },
        Name
      >;
    };
    webhooks: {
      claimWebhookDelivery: FunctionReference<
        "mutation",
        "internal",
        { deliveryId: string },
        { claimed: boolean },
        Name
      >;
      createWebhookDelivery: FunctionReference<
        "mutation",
        "internal",
        {
          createdAt?: number;
          endpointId: string;
          eventId: string;
          eventType: string;
          metadataJson?: string;
          payloadJson: string;
        },
        { created: true; deliveryId: string },
        Name
      >;
      createWebhookEndpoint: FunctionReference<
        "mutation",
        "internal",
        {
          createdAt?: number;
          createdBy?: string;
          description?: string;
          eventTypes: Array<string>;
          metadataJson?: string;
          organizationId?: string;
          secret: string;
          url: string;
        },
        { created: boolean; endpointId: string },
        Name
      >;
      deleteWebhookEndpoint: FunctionReference<
        "mutation",
        "internal",
        { endpointId: string; organizationId: string },
        { ok: true },
        Name
      >;
      enqueueWebhookEvent: FunctionReference<
        "mutation",
        "internal",
        {
          createdAt?: number;
          eventId: string;
          eventType: string;
          metadataJson?: string;
          organizationId?: string;
          payloadJson: string;
        },
        { deliveryIds: Array<string>; enqueued: number; eventId: string },
        Name
      >;
      getWebhookDelivery: FunctionReference<
        "query",
        "internal",
        { deliveryId: string },
        null | {
          _creationTime: number;
          _id: string;
          attemptCount: number;
          createdAt: number;
          deliveredAt?: number;
          endpointId: string;
          eventId: string;
          eventType: string;
          exhaustedAt?: number;
          failureKind?:
            | "endpoint_inactive"
            | "network_error"
            | "rate_limited"
            | "server_error"
            | "client_error"
            | "unknown_error";
          metadataJson?: string;
          nextAttemptAt?: number;
          payloadJson: string;
          responseBody?: string;
          responseStatus?: number;
          status: "pending" | "processing" | "delivered" | "failed";
          updatedAt: number;
        },
        Name
      >;
      getWebhookEndpoint: FunctionReference<
        "query",
        "internal",
        { endpointId: string },
        null | {
          _creationTime: number;
          _id: string;
          createdAt: number;
          createdBy?: string;
          description?: string;
          eventTypes: Array<string>;
          metadataJson?: string;
          organizationId?: string;
          status: "active" | "disabled" | "archived";
          updatedAt: number;
          url: string;
        },
        Name
      >;
      getWebhookEndpointWithSecret: FunctionReference<
        "query",
        "internal",
        { endpointId: string },
        null | {
          _creationTime: number;
          _id: string;
          createdAt: number;
          createdBy?: string;
          description?: string;
          eventTypes: Array<string>;
          metadataJson?: string;
          organizationId?: string;
          secret: string;
          status: "active" | "disabled" | "archived";
          updatedAt: number;
          url: string;
        },
        Name
      >;
      listPendingWebhookDeliveries: FunctionReference<
        "query",
        "internal",
        { beforeNextAttemptAt?: number; limit?: number },
        Array<{
          _creationTime: number;
          _id: string;
          attemptCount: number;
          createdAt: number;
          deliveredAt?: number;
          endpointId: string;
          eventId: string;
          eventType: string;
          exhaustedAt?: number;
          failureKind?:
            | "endpoint_inactive"
            | "network_error"
            | "rate_limited"
            | "server_error"
            | "client_error"
            | "unknown_error";
          metadataJson?: string;
          nextAttemptAt?: number;
          payloadJson: string;
          responseBody?: string;
          responseStatus?: number;
          status: "pending" | "processing" | "delivered" | "failed";
          updatedAt: number;
        }>,
        Name
      >;
      listWebhookDeliveriesByEndpoint: FunctionReference<
        "query",
        "internal",
        {
          endpointId: string;
          limit?: number;
          status?: "pending" | "processing" | "delivered" | "failed";
        },
        Array<{
          _creationTime: number;
          _id: string;
          attemptCount: number;
          createdAt: number;
          deliveredAt?: number;
          endpointId: string;
          eventId: string;
          eventType: string;
          exhaustedAt?: number;
          failureKind?:
            | "endpoint_inactive"
            | "network_error"
            | "rate_limited"
            | "server_error"
            | "client_error"
            | "unknown_error";
          metadataJson?: string;
          nextAttemptAt?: number;
          payloadJson: string;
          responseBody?: string;
          responseStatus?: number;
          status: "pending" | "processing" | "delivered" | "failed";
          updatedAt: number;
        }>,
        Name
      >;
      listWebhookEndpointsByOrganization: FunctionReference<
        "query",
        "internal",
        {
          limit?: number;
          organizationId: string;
          status?: "active" | "disabled" | "archived";
        },
        Array<{
          _creationTime: number;
          _id: string;
          createdAt: number;
          createdBy?: string;
          description?: string;
          eventTypes: Array<string>;
          metadataJson?: string;
          organizationId?: string;
          status: "active" | "disabled" | "archived";
          updatedAt: number;
          url: string;
        }>,
        Name
      >;
      rotateWebhookEndpointSecret: FunctionReference<
        "mutation",
        "internal",
        {
          endpointId: string;
          organizationId: string;
          secret: string;
          updatedAt?: number;
        },
        { ok: true },
        Name
      >;
      setWebhookEndpointStatus: FunctionReference<
        "mutation",
        "internal",
        {
          endpointId: string;
          organizationId: string;
          status: "active" | "disabled" | "archived";
          updatedAt?: number;
        },
        { ok: true },
        Name
      >;
      updateWebhookDelivery: FunctionReference<
        "mutation",
        "internal",
        {
          attemptCount?: number;
          deliveredAt?: number | null;
          deliveryId: string;
          exhaustedAt?: number | null;
          failureKind?:
            | "endpoint_inactive"
            | "network_error"
            | "rate_limited"
            | "server_error"
            | "client_error"
            | "unknown_error"
            | null;
          metadataJson?: string | null;
          nextAttemptAt?: number | null;
          responseBody?: string | null;
          responseStatus?: number | null;
          status?: "pending" | "processing" | "delivered" | "failed";
          updatedAt?: number;
        },
        { ok: true },
        Name
      >;
      updateWebhookEndpoint: FunctionReference<
        "mutation",
        "internal",
        {
          description?: string;
          endpointId: string;
          eventTypes?: Array<string>;
          metadataJson?: string;
          organizationId: string;
          url?: string;
        },
        { ok: true },
        Name
      >;
    };
  };
