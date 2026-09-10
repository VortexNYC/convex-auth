import { SignJWT, createLocalJWKSet, jwtVerify } from "jose";
import { generateRandomCodeVerifier, calculatePKCECodeChallenge } from "oauth4webapi";
import { getJwtPrivateKey, getJwks } from "./jwt.js";

export type OAuthStatePayload = {
  provider: string;
  codeVerifier: string;
  callbackURL?: string;
  errorURL?: string;
  newUserURL?: string;
  requestSignUp?: boolean;
  link?: boolean;
  additionalData?: Record<string, unknown>;
};

export async function generateCodeVerifier(): Promise<string> {
  return generateRandomCodeVerifier();
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  return calculatePKCECodeChallenge(verifier);
}

export async function mintOAuthState(payload: OAuthStatePayload): Promise<string> {
  const { key, kid } = await getJwtPrivateKey();
  return await new SignJWT({ state: true, ...payload })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid })
    .setSubject(payload.provider)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}

export async function verifyOAuthState(token: string): Promise<OAuthStatePayload> {
  const jwks = createLocalJWKSet(getJwks());
  const { payload } = await jwtVerify(token, jwks, { algorithms: ["RS256"] });

  if (payload.state !== true) {
    throw new Error("Invalid OAuth state token");
  }
  if (typeof payload.provider !== "string") {
    throw new Error("Invalid OAuth state token: missing provider");
  }
  if (typeof payload.codeVerifier !== "string") {
    throw new Error("Invalid OAuth state token: missing code verifier");
  }

  return {
    provider: payload.provider,
    codeVerifier: payload.codeVerifier,
    callbackURL: typeof payload.callbackURL === "string" ? payload.callbackURL : undefined,
    errorURL: typeof payload.errorURL === "string" ? payload.errorURL : undefined,
    newUserURL: typeof payload.newUserURL === "string" ? payload.newUserURL : undefined,
    requestSignUp: payload.requestSignUp === true,
    link: payload.link === true,
    additionalData:
      typeof payload.additionalData === "object" && payload.additionalData !== null
        ? (payload.additionalData as Record<string, unknown>)
        : undefined,
  };
}
