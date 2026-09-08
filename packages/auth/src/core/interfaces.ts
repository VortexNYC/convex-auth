import type { AuthRuntimeStatus } from "./auth-readiness";
import type { ExecutionContext } from "./execution-context";
import type { NormalizedAuthIdentity } from "./identity";
import type { AuthPrincipal } from "./principal";

export type IdentityLookupResult = {
  userId: string;
  identityId: string;
};

export type ResolvedAuthContext = {
  principal: AuthPrincipal;
  execution: ExecutionContext;
};

export interface AuthIdentityService {
  findOrProvisionUser(identity: NormalizedAuthIdentity): Promise<IdentityLookupResult>;
  getUserByIdentity(identity: NormalizedAuthIdentity): Promise<string | null>;
  linkIdentity(userId: string, identity: NormalizedAuthIdentity): Promise<string>;
}

export interface OrganizationAccessService {
  getActiveOrganization(userId: string): Promise<string | null>;
  setActiveOrganization(userId: string, organizationId: string): Promise<void>;
  getEffectivePermissions(userId: string, organizationId: string): Promise<string[]>;
}

export interface InvitationService {
  createInvitation(input: {
    organizationId: string;
    roleId: string;
    email: string;
    invitedBy: string;
  }): Promise<string>;
  redeemInvitation(input: { token: string; userId: string; email: string | null }): Promise<string>;
}

export interface PrincipalResolver {
  resolveFromRequest(context: unknown): Promise<ResolvedAuthContext>;
}

export interface AuthorizationService {
  requireAuthenticated(context: ResolvedAuthContext): void;
  requireOrganization(context: ResolvedAuthContext): string;
  requireNotRestricted(context: ResolvedAuthContext): void;
  requirePermission(context: ResolvedAuthContext, permission: string): void;
}

export interface AuthReadinessService {
  getStatus(): AuthRuntimeStatus;
  canRunProtectedConvexWork(): boolean;
  requireConvexReady(): void;
}
