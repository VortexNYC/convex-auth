export type AnonymousPrincipal = {
  kind: "anonymous";
  permissions: [];
};

export type UserPrincipal = {
  kind: "user";
  userId: string;
  identityId: string | null;
  activeOrganizationId: string | null;
  membershipIds: string[];
  roleKeys: string[];
  permissions: string[];
  sessionId: string | null;
  isRestricted: boolean;
  restrictedReason: string | null;
};

export type ServicePrincipal = {
  kind: "service";
  serviceId: string;
  keyId: string | null;
  organizationId: string | null;
  permissions: string[];
  isRestricted: boolean;
  restrictedReason: string | null;
};

export type AgentMode = "delegated" | "autonomous";

export type AgentCapabilityConstraintPrimitive = string | number | boolean;

export type AgentCapabilityConstraint =
  | AgentCapabilityConstraintPrimitive
  | {
      eq?: AgentCapabilityConstraintPrimitive;
      min?: number;
      max?: number;
      in?: readonly AgentCapabilityConstraintPrimitive[];
      notIn?: readonly AgentCapabilityConstraintPrimitive[];
    };

export type AgentCapabilityGrantSnapshot = {
  capability: string;
  constraints: Readonly<Record<string, AgentCapabilityConstraint>> | null;
  expiresAt: number | null;
};

export type AgentPrincipal = {
  kind: "agent";
  agentId: string;
  hostId: string;
  organizationId: string;
  mode: AgentMode;
  delegatedUserId: string | null;
  credentialId: string;
  permissions: string[];
  capabilityGrants: AgentCapabilityGrantSnapshot[];
  isRestricted: boolean;
  restrictedReason: string | null;
};

export type ApiKeyPrincipal = {
  kind: "apiKey";
  apiKeyId: string;
  ownerType: "user" | "organization" | "service";
  ownerId: string;
  organizationId: string | null;
  inheritedPermissions: string[];
  narrowedPermissions: string[] | null;
  effectivePermissions: string[];
  isRestricted: boolean;
  restrictedReason: string | null;
};

export type OAuthClientPrincipal = {
  kind: "oauthClient";
  clientId: string;
  subjectType: "user" | "service" | "client";
  subjectId: string | null;
  organizationId: string | null;
  audience: string | null;
  scopes: string[];
  permissions: string[];
  isRestricted: boolean;
  restrictedReason: string | null;
};

export type AuthPrincipal =
  | AnonymousPrincipal
  | UserPrincipal
  | ServicePrincipal
  | AgentPrincipal
  | ApiKeyPrincipal
  | OAuthClientPrincipal;
