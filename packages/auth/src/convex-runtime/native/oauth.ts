import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";
import * as oauth from "oauth4webapi";

export type OAuthUserInfo = {
  id: string;
  name?: string;
  email?: string;
  image?: string;
  emailVerified: boolean;
};

export type OAuthToken = {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  tokenType?: string;
  expiresAt?: number;
  scopes?: string[];
};

export type OAuthProviderOptions = {
  /** Disable all sign ups for this provider, even with `requestSignUp`. */
  disableSignUp?: boolean;
  /** Disable sign up unless the client explicitly passes `requestSignUp`. */
  disableImplicitSignUp?: boolean;
  /** Require the provider to report the email as verified before issuing a session. */
  requireEmailVerification?: boolean;
  /** Extra query parameters to append to the authorization URL. */
  additionalParams?: Record<string, string>;
};

export type NativeOAuthProvider = {
  id: string;
  name: string;
  issuer: string;
  options: OAuthProviderOptions;
  createAuthorizationURL(args: {
    state: string;
    codeVerifier: string;
    redirectURI: string;
    scopes?: string[];
  }): Promise<URL>;
  exchangeAuthorizationCode(args: {
    code: string;
    codeVerifier: string;
    redirectURI: string;
  }): Promise<OAuthToken>;
  getUserInfo(args: {
    accessToken: string;
    idToken?: string;
  }): Promise<{ user: OAuthUserInfo; data: unknown }>;
};

export type GitHubProfile = {
  id: number;
  login: string;
  name?: string | null;
  email?: string | null;
  avatar_url?: string;
};

export type GitHubEmail = {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility?: string | null;
};

export type GitHubProviderConfig = OAuthProviderOptions & {
  clientId: string;
  clientSecret: string;
  /** @default "https://github.com" */
  enterpriseBaseUrl?: string;
  /** @default ["read:user", "user:email"] */
  scopes?: string[];
  /** Override fetch for testing. */
  fetchImpl?: typeof fetch;
};

export type GoogleProfile = {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
};

export type GoogleProviderConfig = OAuthProviderOptions & {
  clientId: string;
  clientSecret: string;
  /** @default ["openid", "email", "profile"] */
  scopes?: string[];
  /** Override fetch for testing. */
  fetchImpl?: typeof fetch;
  /** Request a refresh token by setting `access_type=offline`. */
  accessType?: "online" | "offline";
  /** @default "consent" when `accessType` is "offline" */
  prompt?: "none" | "select_account" | "consent" | "login";
  /** Pre-fill the login hint. */
  loginHint?: string;
  /** Restrict to a Google Workspace hosted domain. */
  hd?: string;
  /** Forward granted scopes from previous authorizations. */
  includeGrantedScopes?: boolean;
  /** Maximum age in seconds for a Google ID token. */
  maxTokenAge?: number;
  /** Display mode for the Google consent screen. */
  display?: "page" | "popup" | "touch" | "wap";
};

export type DiscordProfile = {
  id: string;
  username: string;
  email?: string;
  verified?: boolean;
  avatar?: string | null;
};

export type DiscordProviderConfig = OAuthProviderOptions & {
  clientId: string;
  clientSecret: string;
  /** @default ["identify", "email"] */
  scopes?: string[];
  /** Override fetch for testing. */
  fetchImpl?: typeof fetch;
};

export type GenericOAuthUserInfoMap = {
  id?: string;
  name?: string;
  email?: string;
  image?: string;
  emailVerified?: string;
};

export type GenericOAuthProviderConfig = OAuthProviderOptions & {
  clientId: string;
  clientSecret: string;
  /** Issuer string used for token bookkeeping. Defaults to the authorization endpoint origin. */
  issuer?: string;
  /** Full authorization endpoint URL. */
  authorizationEndpoint: string;
  /** Full token endpoint URL. */
  tokenEndpoint: string;
  /** Full userinfo endpoint URL. */
  userInfoEndpoint: string;
  /** @default [] */
  scopes?: string[];
  /** Map common userinfo fields to top-level response keys. Provide `profile` for full control. */
  userInfo?: GenericOAuthUserInfoMap;
  /** Override profile extraction. Takes the parsed userinfo response and returns {@link OAuthUserInfo}. */
  profile?: (data: unknown) => OAuthUserInfo | Promise<OAuthUserInfo>;
  /** Override fetch for testing. */
  fetchImpl?: typeof fetch;
};

function getGitHubUrls(config: GitHubProviderConfig): {
  authorize: string;
  token: string;
  apiBase: string;
  issuer: string;
} {
  if (config.enterpriseBaseUrl) {
    const base = new URL(config.enterpriseBaseUrl);
    return {
      authorize: `${base.origin}/login/oauth/authorize`,
      token: `${base.origin}/login/oauth/access_token`,
      apiBase: `${base.origin}/api/v3`,
      issuer: `${base.origin}/login/oauth`,
    };
  }
  return {
    authorize: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
    apiBase: "https://api.github.com",
    issuer: "https://github.com/login/oauth",
  };
}

function makeCustomFetch(
  fetchImpl: typeof fetch,
): (url: string, init: RequestInit) => Promise<Response> {
  return (url, init) => fetchImpl(url, init);
}

function makeClient(clientId: string): oauth.Client {
  return { client_id: clientId };
}

function makeClientAuth(clientSecret: string): oauth.ClientAuth {
  return oauth.ClientSecretPost(clientSecret);
}

function authorizationServer(
  issuer: string,
  endpoints: { authorize: string; token: string },
): oauth.AuthorizationServer {
  return {
    issuer,
    authorization_endpoint: endpoints.authorize,
    token_endpoint: endpoints.token,
  };
}

async function buildAuthorizationURL(
  as: oauth.AuthorizationServer,
  client: oauth.Client,
  {
    state,
    codeVerifier,
    redirectURI,
    scopes,
    additionalParams,
  }: {
    state: string;
    codeVerifier: string;
    redirectURI: string;
    scopes: string[];
    additionalParams?: Record<string, string>;
  },
): Promise<URL> {
  const url = new URL(as.authorization_endpoint!);
  url.searchParams.set("client_id", client.client_id);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectURI);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", await oauth.calculatePKCECodeChallenge(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", scopes.join(" "));

  if (additionalParams) {
    for (const [key, value] of Object.entries(additionalParams)) {
      if (!url.searchParams.has(key)) {
        url.searchParams.set(key, value);
      }
    }
  }

  return url;
}

function parseScopes(scope: string | undefined): string[] | undefined {
  if (!scope) return undefined;
  return scope.split(/[,\s]+/).filter(Boolean);
}

async function exchangeAuthorizationCode(
  as: oauth.AuthorizationServer,
  client: oauth.Client,
  clientSecret: string,
  {
    code,
    codeVerifier,
    redirectURI,
    fetchImpl,
  }: {
    code: string;
    codeVerifier: string;
    redirectURI: string;
    fetchImpl: typeof fetch;
  },
): Promise<OAuthToken> {
  const clientAuth = makeClientAuth(clientSecret);
  const callbackParameters = oauth.validateAuthResponse(
    as,
    client,
    new URLSearchParams({ code }),
    oauth.skipStateCheck,
  );
  const customFetch = makeCustomFetch(fetchImpl);
  const response = await oauth.authorizationCodeGrantRequest(
    as,
    client,
    clientAuth,
    callbackParameters,
    redirectURI,
    codeVerifier,
    { [oauth.customFetch]: customFetch },
  );
  const result = await oauth.processAuthorizationCodeResponse(as, client, response, {
    requireIdToken: false,
  });

  return {
    accessToken: result.access_token,
    tokenType: result.token_type,
    refreshToken: result.refresh_token,
    idToken: result.id_token,
    expiresAt: result.expires_in ? Date.now() + result.expires_in * 1000 : undefined,
    scopes: parseScopes(result.scope),
  };
}

export function createGoogleProvider(config: GoogleProviderConfig): NativeOAuthProvider {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const defaultScopes = ["openid", "email", "profile"];
  const as = authorizationServer("https://accounts.google.com", {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
  });
  const client = makeClient(config.clientId);

  const providerOptions: OAuthProviderOptions = {
    disableSignUp: config.disableSignUp,
    disableImplicitSignUp: config.disableImplicitSignUp,
    requireEmailVerification: config.requireEmailVerification,
    additionalParams: config.additionalParams,
  };

  const requestedScopes = [...defaultScopes];
  if (config.scopes?.length) {
    for (const scope of config.scopes) {
      if (!requestedScopes.includes(scope)) {
        requestedScopes.push(scope);
      }
    }
  }

  const additionalParams: Record<string, string> = {};
  if (config.accessType) {
    additionalParams.access_type = config.accessType;
    if (config.accessType === "offline" && !config.prompt) {
      additionalParams.prompt = "consent";
    }
  }
  if (config.prompt) additionalParams.prompt = config.prompt;
  if (config.loginHint) additionalParams.login_hint = config.loginHint;
  if (config.hd) additionalParams.hd = config.hd;
  if (config.display) additionalParams.display = config.display;
  if (config.includeGrantedScopes !== false) additionalParams.include_granted_scopes = "true";
  if (config.additionalParams) {
    for (const [key, value] of Object.entries(config.additionalParams)) {
      additionalParams[key] = value;
    }
  }

  return {
    id: "google",
    name: "Google",
    issuer: as.issuer,
    options: providerOptions,

    async createAuthorizationURL({ state, codeVerifier, redirectURI, scopes }) {
      return buildAuthorizationURL(as, client, {
        state,
        codeVerifier,
        redirectURI,
        scopes: scopes?.length ? [...new Set([...requestedScopes, ...scopes])] : requestedScopes,
        additionalParams,
      });
    },

    async exchangeAuthorizationCode(args) {
      return exchangeAuthorizationCode(as, client, config.clientSecret, { ...args, fetchImpl });
    },

    async getUserInfo({ accessToken, idToken }) {
      if (idToken) {
        const jwksResponse = await fetchImpl("https://www.googleapis.com/oauth2/v3/certs");
        if (!jwksResponse.ok) {
          throw new Error(`Google JWKS request failed: ${jwksResponse.status}`);
        }
        const jwks = (await jwksResponse.json()) as JSONWebKeySet;
        const jwksSet = createLocalJWKSet(jwks);
        const { payload } = await jwtVerify(idToken, jwksSet, {
          algorithms: ["RS256"],
          issuer: ["https://accounts.google.com", "accounts.google.com"],
          audience: config.clientId,
          maxTokenAge: config.maxTokenAge,
        });

        const hd = config.hd;
        if (hd && payload.hd !== hd) {
          throw new Error(`Google id_token hosted domain mismatch: expected ${hd}`);
        }

        return {
          user: {
            id: String(payload.sub),
            name: payload.name as string | undefined,
            email: payload.email as string | undefined,
            image: payload.picture as string | undefined,
            emailVerified: payload.email_verified === true,
          },
          data: payload,
        };
      }

      const response = await fetchImpl("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`Google userinfo request failed: ${response.status}`);
      }
      const profile = (await response.json()) as GoogleProfile;

      return {
        user: {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
          emailVerified: profile.email_verified ?? false,
        },
        data: profile,
      };
    },
  };
}

export function createGitHubProvider(config: GitHubProviderConfig): NativeOAuthProvider {
  const urls = getGitHubUrls(config);
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const defaultScopes = ["read:user", "user:email"];
  const as = authorizationServer(urls.issuer, {
    authorize: urls.authorize,
    token: urls.token,
  });
  const client = makeClient(config.clientId);

  const providerOptions: OAuthProviderOptions = {
    disableSignUp: config.disableSignUp,
    disableImplicitSignUp: config.disableImplicitSignUp,
    requireEmailVerification: config.requireEmailVerification,
    additionalParams: config.additionalParams,
  };

  const requestedScopes = [...defaultScopes];
  if (config.scopes?.length) {
    for (const scope of config.scopes) {
      if (!requestedScopes.includes(scope)) {
        requestedScopes.push(scope);
      }
    }
  }

  return {
    id: "github",
    name: "GitHub",
    issuer: as.issuer,
    options: providerOptions,

    async createAuthorizationURL({ state, codeVerifier, redirectURI, scopes }) {
      return buildAuthorizationURL(as, client, {
        state,
        codeVerifier,
        redirectURI,
        scopes: scopes?.length ? [...new Set([...requestedScopes, ...scopes])] : requestedScopes,
        additionalParams: config.additionalParams,
      });
    },

    async exchangeAuthorizationCode(args) {
      return exchangeAuthorizationCode(as, client, config.clientSecret, { ...args, fetchImpl });
    },

    async getUserInfo({ accessToken }) {
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "convex-auth",
        Accept: "application/vnd.github+json",
      };

      const profileResponse = await fetchImpl(`${urls.apiBase}/user`, { headers });
      if (!profileResponse.ok) {
        throw new Error(`GitHub userinfo request failed: ${profileResponse.status}`);
      }
      const profile = (await profileResponse.json()) as GitHubProfile;

      let email = profile.email ?? undefined;
      let emailVerified = false;

      const emailsResponse = await fetchImpl(`${urls.apiBase}/user/emails`, { headers });
      if (emailsResponse.ok) {
        const emails = (await emailsResponse.json()) as GitHubEmail[];
        if (!email) {
          const primary = emails.find((e) => e.primary) ?? emails[0];
          if (primary) {
            email = primary.email;
            emailVerified = primary.verified;
          }
        } else {
          const matched = emails.find((e) => e.email === email);
          emailVerified = matched?.verified ?? false;
        }
      }

      return {
        user: {
          id: profile.id.toString(),
          name: profile.name ?? profile.login,
          email,
          image: profile.avatar_url,
          emailVerified,
        },
        data: profile,
      };
    },
  };
}

export function createDiscordProvider(config: DiscordProviderConfig): NativeOAuthProvider {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const defaultScopes = ["identify", "email"];
  const as = authorizationServer("https://discord.com", {
    authorize: "https://discord.com/oauth2/authorize",
    token: "https://discord.com/api/oauth2/token",
  });
  const client = makeClient(config.clientId);

  const providerOptions: OAuthProviderOptions = {
    disableSignUp: config.disableSignUp,
    disableImplicitSignUp: config.disableImplicitSignUp,
    requireEmailVerification: config.requireEmailVerification,
    additionalParams: config.additionalParams,
  };

  const requestedScopes = [...defaultScopes];
  if (config.scopes?.length) {
    for (const scope of config.scopes) {
      if (!requestedScopes.includes(scope)) {
        requestedScopes.push(scope);
      }
    }
  }

  return {
    id: "discord",
    name: "Discord",
    issuer: as.issuer,
    options: providerOptions,

    async createAuthorizationURL({ state, codeVerifier, redirectURI, scopes }) {
      return buildAuthorizationURL(as, client, {
        state,
        codeVerifier,
        redirectURI,
        scopes: scopes?.length ? [...new Set([...requestedScopes, ...scopes])] : requestedScopes,
        additionalParams: config.additionalParams,
      });
    },

    async exchangeAuthorizationCode(args) {
      return exchangeAuthorizationCode(as, client, config.clientSecret, { ...args, fetchImpl });
    },

    async getUserInfo({ accessToken }) {
      const response = await fetchImpl("https://discord.com/api/users/@me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`Discord userinfo request failed: ${response.status}`);
      }
      const profile = (await response.json()) as DiscordProfile;

      const image = profile.avatar
        ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
        : undefined;

      return {
        user: {
          id: profile.id,
          name: profile.username,
          email: profile.email,
          image,
          emailVerified: profile.verified ?? false,
        },
        data: profile,
      };
    },
  };
}

function resolveBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true" || value === "1";
  if (typeof value === "number") return value === 1;
  return Boolean(value);
}

function mapGenericUserInfo(
  data: unknown,
  map: GenericOAuthUserInfoMap | undefined,
): OAuthUserInfo {
  const record = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  const id = map?.id ? record[map.id] : (record.id ?? record.sub ?? record.user_id);
  const name = map?.name ? record[map.name] : (record.name ?? record.username ?? record.login);
  const email = map?.email ? record[map.email] : record.email;
  const image = map?.image ? record[map.image] : (record.image ?? record.picture ?? record.avatar);
  const verified = map?.emailVerified
    ? record[map.emailVerified]
    : (record.emailVerified ?? record.email_verified ?? record.verified);
  return {
    id: typeof id === "string" ? id : String(id ?? ""),
    name: typeof name === "string" ? name : undefined,
    email: typeof email === "string" ? email : undefined,
    image: typeof image === "string" ? image : undefined,
    emailVerified: resolveBoolean(verified),
  };
}

export function createGenericOAuthProvider(
  id: string,
  config: GenericOAuthProviderConfig,
): NativeOAuthProvider {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const requestedScopes = [...(config.scopes ?? [])];
  const issuer = config.issuer ?? new URL(config.authorizationEndpoint).origin;
  const as = authorizationServer(issuer, {
    authorize: config.authorizationEndpoint,
    token: config.tokenEndpoint,
  });
  const client = makeClient(config.clientId);

  const providerOptions: OAuthProviderOptions = {
    disableSignUp: config.disableSignUp,
    disableImplicitSignUp: config.disableImplicitSignUp,
    requireEmailVerification: config.requireEmailVerification,
    additionalParams: config.additionalParams,
  };

  return {
    id,
    name: id,
    issuer: as.issuer,
    options: providerOptions,

    async createAuthorizationURL({ state, codeVerifier, redirectURI, scopes }) {
      return buildAuthorizationURL(as, client, {
        state,
        codeVerifier,
        redirectURI,
        scopes: scopes?.length ? [...new Set([...requestedScopes, ...scopes])] : requestedScopes,
        additionalParams: config.additionalParams,
      });
    },

    async exchangeAuthorizationCode(args) {
      return exchangeAuthorizationCode(as, client, config.clientSecret, { ...args, fetchImpl });
    },

    async getUserInfo({ accessToken }) {
      const response = await fetchImpl(config.userInfoEndpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`Generic OAuth userinfo request failed: ${response.status}`);
      }
      const data = await response.json();

      const user = config.profile
        ? await config.profile(data)
        : mapGenericUserInfo(data, config.userInfo);

      return { user, data };
    },
  };
}
