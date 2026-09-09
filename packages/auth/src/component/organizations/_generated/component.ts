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
    status: {
      get: FunctionReference<
        "query",
        "internal",
        {},
        { component: "convexAuth"; schemaVersion: number },
        Name
      >;
    };
  };
