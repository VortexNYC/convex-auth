import type { GenericActionCtx, GenericDataModel } from "convex/server";
import {
  createDiscordProvider,
  createGenericOAuthProvider,
  createGitHubProvider,
  createGoogleProvider,
  type GenericOAuthProviderConfig,
  type NativeOAuthProvider,
  type OAuthToken,
  type OAuthUserInfo,
} from "./oauth.js";
import type { DiscordProviderConfig, GitHubProviderConfig, GoogleProviderConfig } from "./oauth.js";
import type { NativeUserDoc } from "./types.js";
import {
  generateCodeVerifier,
  mintOAuthState,
  verifyOAuthState,
  type OAuthStatePayload,
} from "./oauthState.js";
import { mintToken } from "./jwt.js";
import { generateVerificationToken, hashToken } from "./tokens.js";
import { encryptOAuthTokens } from "./oauthCrypto.js";
import type { NativeOAuthComponentHandle } from "./types.js";

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type AccountLinkingConfig = {
  /** @default true */
  enabled?: boolean;
  /** When true, users must explicitly use `linkSocial` to attach an OAuth account. */
  disableImplicitLinking?: boolean;
  /** When true, linking an OAuth account to an existing user requires the provider to report the email as verified. */
  requiresEmailVerification?: boolean;
};

export type NativeOAuthConfig = {
  github?: GitHubProviderConfig;
  google?: GoogleProviderConfig;
  discord?: DiscordProviderConfig;
  /** Arbitrary generic OAuth providers by ID. */
  providers?: Record<string, GenericOAuthProviderConfig>;
  /** Full callback URL registered with the OAuth provider. */
  redirectURI?: string;
  /**
   * Origins allowed for `callbackURL`, `errorURL`, and `newUserURL` passed to
   * `signInWithRedirect`. Defaults to `process.env.CONVEX_SITE_URL`.
   */
  trustedOrigins?: string[];
  /** @default 7 days */
  sessionTtlMs?: number;
  /** Providers whose `emailVerified` claim is trusted enough to link accounts by email. */
  trustedProviders?: string[];
  /** Account linking policy. */
  accountLinking?: AccountLinkingConfig;
};

export type NativeOAuthSignInArgs = {
  provider: string;
  callbackURL?: string;
  errorURL?: string;
  newUserURL?: string;
  /** Explicitly allow creating a new user when `disableImplicitSignUp` is set. */
  requestSignUp?: boolean;
  /** Link this OAuth account to the currently authenticated user (callback only). */
  link?: boolean;
  /** Untrusted client data preserved through the OAuth redirect. */
  additionalData?: Record<string, unknown>;
};

export type NativeOAuthCallbackArgs = {
  provider: string;
  code: string;
  state: string;
  /** User to link this OAuth account to when the sign-in state was initiated with `link: true`. */
  linkingUserId?: string;
};

export type NativeOAuthCallbackResult = {
  token: string;
  refreshToken: string;
  userId: string;
  identityId: string;
  sessionId: string;
  redirectUrl: string;
  createdUser: boolean;
};

export type NativeOAuthCallbackErrorResult = {
  error: string;
  errorDescription?: string;
  redirectUrl: string;
};

const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getProvider(config: NativeOAuthConfig, providerId: string): NativeOAuthProvider {
  if (providerId === "github" && config.github) {
    return createGitHubProvider(config.github);
  }
  if (providerId === "google" && config.google) {
    return createGoogleProvider(config.google);
  }
  if (providerId === "discord" && config.discord) {
    return createDiscordProvider(config.discord);
  }
  if (config.providers?.[providerId]) {
    return createGenericOAuthProvider(providerId, config.providers[providerId]);
  }
  throw new Error(`Unsupported OAuth provider: ${providerId}`);
}

function getRedirectURI(config: NativeOAuthConfig, provider: NativeOAuthProvider): string {
  if (config.redirectURI) return config.redirectURI;
  const siteUrl = process.env.AUTH_REDIRECT_URL ?? process.env.CONVEX_SITE_URL;
  if (!siteUrl) {
    throw new Error("Missing OAuth redirect URI: set CONVEX_SITE_URL or pass redirectURI");
  }
  return `${siteUrl.replace(/\/$/, "")}/api/auth/callback/${provider.id}`;
}

export async function handleSignIn(
  config: NativeOAuthConfig,
  args: NativeOAuthSignInArgs,
): Promise<{ url: string }> {
  const provider = getProvider(config, args.provider);
  const redirectURI = getRedirectURI(config, provider);
  const codeVerifier = await generateCodeVerifier();
  const state = await mintOAuthState({
    provider: provider.id,
    codeVerifier,
    callbackURL: args.callbackURL,
    errorURL: args.errorURL,
    newUserURL: args.newUserURL,
    requestSignUp: args.requestSignUp,
    link: args.link,
    additionalData: args.additionalData,
  });
  const url = await provider.createAuthorizationURL({
    state,
    codeVerifier,
    redirectURI,
  });
  return { url: url.toString() };
}

function resolveErrorURL(statePayload: OAuthStatePayload): string {
  return statePayload.errorURL || statePayload.callbackURL || process.env.SITE_URL || "/";
}

function resolveCallbackURL(statePayload: OAuthStatePayload, createdUser: boolean): string {
  return (
    (createdUser && statePayload.newUserURL) ||
    statePayload.callbackURL ||
    process.env.SITE_URL ||
    "/"
  );
}

export async function handleCallback<DataModel extends GenericDataModel>(
  ctx: GenericActionCtx<DataModel>,
  component: NativeOAuthComponentHandle,
  config: NativeOAuthConfig,
  args: NativeOAuthCallbackArgs,
): Promise<NativeOAuthCallbackResult | NativeOAuthCallbackErrorResult> {
  let statePayload: OAuthStatePayload;
  try {
    statePayload = await verifyOAuthState(args.state);
  } catch {
    return { error: "invalid_state", redirectUrl: process.env.SITE_URL || "/" };
  }

  if (statePayload.provider !== args.provider) {
    return { error: "provider_mismatch", redirectUrl: resolveErrorURL(statePayload) };
  }

  const provider = getProvider(config, args.provider);
  const redirectURI = getRedirectURI(config, provider);

  let tokens: OAuthToken;
  let userInfo: { user: OAuthUserInfo; data: unknown };
  try {
    tokens = await provider.exchangeAuthorizationCode({
      code: args.code,
      codeVerifier: statePayload.codeVerifier,
      redirectURI,
    });
    userInfo = await provider.getUserInfo({
      accessToken: tokens.accessToken,
      idToken: tokens.idToken,
    });
  } catch (e) {
    return {
      error: "token_exchange_failed",
      errorDescription: e instanceof Error ? e.message : undefined,
      redirectUrl: resolveErrorURL(statePayload),
    };
  }

  const { user } = userInfo;
  if (!user.id) {
    return { error: "invalid_userinfo", redirectUrl: resolveErrorURL(statePayload) };
  }

  const existingAccount = await ctx.runQuery(component.native.accounts.getAccountBySubject, {
    provider: provider.id,
    issuer: provider.issuer,
    subject: user.id,
  });

  let existingUserByEmail: NativeUserDoc | null = null;
  if (user.email) {
    existingUserByEmail = await ctx.runQuery(component.native.users.getUserByEmail, {
      email: user.email,
    });
  }

  let linkingUser: NativeUserDoc | null = null;
  if (statePayload.link) {
    if (!args.linkingUserId) {
      return { error: "account_not_linked", redirectUrl: resolveErrorURL(statePayload) };
    }
    linkingUser = await ctx.runQuery(component.native.users.getUserById, {
      userId: args.linkingUserId,
    });
    if (!linkingUser) {
      return { error: "account_not_linked", redirectUrl: resolveErrorURL(statePayload) };
    }
    if (existingAccount && existingAccount.userId !== args.linkingUserId) {
      return { error: "account_not_linked", redirectUrl: resolveErrorURL(statePayload) };
    }
    if (existingUserByEmail && existingUserByEmail._id !== args.linkingUserId) {
      return { error: "account_not_linked", redirectUrl: resolveErrorURL(statePayload) };
    }
  }

  const accountAlreadyLinked = existingAccount !== null;
  const isNewAccount = !accountAlreadyLinked;
  const isNewUser = !statePayload.link && isNewAccount && !existingUserByEmail;
  const isImplicitLink =
    !statePayload.link && isNewAccount && existingUserByEmail !== null && !linkingUser;

  if (isNewUser) {
    const disableSignUp =
      provider.options?.disableSignUp ||
      (provider.options?.disableImplicitSignUp && !statePayload.requestSignUp);
    if (disableSignUp) {
      return { error: "signup_disabled", redirectUrl: resolveErrorURL(statePayload) };
    }
  }

  if (isImplicitLink) {
    const isTrustedProvider = config.trustedProviders?.includes(provider.id) ?? false;
    const accountLinking = config.accountLinking;
    const requiresEmailVerification =
      accountLinking?.requiresEmailVerification === true ? true : !isTrustedProvider;
    if (
      (requiresEmailVerification && !user.emailVerified) ||
      accountLinking?.enabled === false ||
      accountLinking?.disableImplicitLinking === true
    ) {
      return { error: "account_not_linked", redirectUrl: resolveErrorURL(statePayload) };
    }
  }

  const linkTargetUser = linkingUser ?? undefined;
  if (statePayload.link && !linkTargetUser) {
    return { error: "account_not_linked", redirectUrl: resolveErrorURL(statePayload) };
  }

  const identityResult = await ctx.runMutation(component.identity.provisionFromIdentity, {
    identity: {
      identityId: `${provider.issuer}:${user.id}`,
      provider: provider.id,
      issuer: provider.issuer,
      subject: user.id,
      tokenIdentifier: `${provider.issuer}:${user.id}`,
      email: user.email,
      emailVerified: user.emailVerified,
      sessionId: null,
    },
    user: {
      name: user.name,
      email: linkTargetUser?.email ?? user.email,
      image: user.image,
      emailVerified: linkTargetUser?.emailVerified ?? user.emailVerified,
    },
  });

  if (!identityResult.identityId) {
    throw new Error("OAuth identity was not provisioned");
  }

  const encryptedTokens = await encryptOAuthTokens(tokens);

  if (!existingAccount) {
    await ctx.runMutation(component.native.accounts.createAccount, {
      userId: identityResult.userId,
      provider: provider.id,
      issuer: provider.issuer,
      subject: user.id,
      credentialHash: "",
      accessToken: encryptedTokens.accessToken,
      refreshToken: encryptedTokens.refreshToken,
      idToken: encryptedTokens.idToken,
      tokenType: encryptedTokens.tokenType,
      scopes: encryptedTokens.scopes,
      accessTokenExpiresAt: encryptedTokens.expiresAt,
    });
  } else {
    await ctx.runMutation(component.native.accounts.updateAccountTokens, {
      accountId: existingAccount._id,
      accessToken: encryptedTokens.accessToken,
      refreshToken: encryptedTokens.refreshToken,
      idToken: encryptedTokens.idToken,
      tokenType: encryptedTokens.tokenType,
      scopes: encryptedTokens.scopes,
      accessTokenExpiresAt: encryptedTokens.expiresAt,
    });
  }

  if (provider.options?.requireEmailVerification && !user.emailVerified) {
    return {
      error: "email_not_verified",
      redirectUrl: resolveErrorURL(statePayload),
    };
  }

  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const sessionTtlMs = config.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const sessionExpiresAt = now + sessionTtlMs;
  const token = await mintToken(
    identityResult.userId,
    sessionId,
    { identityId: identityResult.identityId },
    { expiresInSeconds: Math.floor(sessionTtlMs / 1000) },
  );

  const refreshToken = generateVerificationToken();
  const refreshTokenHash = await hashToken(refreshToken);
  const refreshTokenExpiresAt = now + REFRESH_TOKEN_TTL_MS;
  await ctx.runMutation(component.native.sessions.createSessionAndRefreshToken, {
    sessionId,
    userId: identityResult.userId,
    token,
    sessionExpiresAt,
    refreshTokenHash,
    refreshTokenExpiresAt,
  });

  const redirectUrl = resolveCallbackURL(statePayload, identityResult.createdUser);

  return {
    token,
    refreshToken,
    userId: identityResult.userId,
    identityId: identityResult.identityId,
    sessionId,
    redirectUrl,
    createdUser: identityResult.createdUser,
  };
}
