import type { ExecutionContext } from "./execution-context";
import type { AuthPrincipal } from "./principal";

export type ApiCredentialType = "userBearer" | "apiKeyBearer" | "oauthToken";

export type VerifiedUserToken = {
  credentialType: "userBearer";
  provider: string;
  issuer: string;
  subject: string;
  tokenIdentifier: string;
  sessionId: string | null;
  scopes: string[];
  audience: string | null;
  rawClaims: Record<string, unknown>;
};

export type VerifiedApiKeyToken = {
  credentialType: "apiKeyBearer";
  presentedKeyPrefix: string;
  rawToken: string;
};

export type VerifiedApiCredential = VerifiedUserToken | VerifiedApiKeyToken;

export type ApiResolvedAuthContext = {
  credentialType: ApiCredentialType;
  principal: AuthPrincipal;
  execution: ExecutionContext;
  userId: string | null;
  organizationId: string | null;
  permissions: string[];
  scopes: string[];
};

export type ApiTokenVerifier = {
  verifyUserBearerToken(token: string): Promise<VerifiedUserToken>;
};
