export type NormalizedIdentityProviderKey = string;

export type AuthProvider = NormalizedIdentityProviderKey;

export type NormalizedAuthIdentity = {
  provider: NormalizedIdentityProviderKey;
  subject: string;
  issuer: string;
  tokenIdentifier: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  imageUrl: string | null;
  sessionId: string | null;
  rawClaims: Record<string, unknown>;
};
