import { action } from "../../component/_generated/server.js";
import type { DataModel } from "../../component/_generated/dataModel.js";
import type { FunctionReference, GenericActionCtx } from "convex/server";
import { v } from "convex/values";
import { mintToken } from "./jwt.js";
import { hashPassword } from "./password.js";
import { generateVerificationToken, hashToken } from "./tokens.js";
import {
  toNativeAuthUser,
  type NativeAccountDoc,
  type NativeAuthSession,
  type NativeAuthUser,
  type NativeIdentityDoc,
  type NativeUserDoc,
} from "./types.js";
import type { GenericDataModel } from "convex/server";

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const DEFAULT_REFRESH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const DONT_REMEMBER_SESSION_TTL_MS = 1000 * 60 * 60 * 24;

export type AnonymousOnLinkAccountData = {
  anonymousUser: NativeAuthUser;
  newUser: NativeAuthUser;
};

export type AnonymousOnLinkAccountFn = (
  data: AnonymousOnLinkAccountData,
  ctx: GenericActionCtx<GenericDataModel>,
) => Promise<void>;

export type NativeAnonymousConfig = {
  emailDomain?: string;
  generateName?: () => string | Promise<string>;
  onLinkAccount?: AnonymousOnLinkAccountFn;
  sessionTtlMs?: number;
  refreshTokenTtlMs?: number;
};

export type NativeAnonymousComponentHandle = {
  anonymous: {
    createAnonymousUser: FunctionReference<
      "mutation",
      "public" | "internal",
      { email: string; name?: string; image?: string },
      { userId: string; identityId: string },
      string
    >;
    linkAnonymousUser: FunctionReference<
      "mutation",
      "public" | "internal",
      {
        userId: string;
        email: string;
        name?: string;
        image?: string;
        emailVerified?: boolean;
      },
      { success: boolean },
      string
    >;
  };
  sessions: {
    createSessionAndRefreshToken: FunctionReference<
      "mutation",
      "public" | "internal",
      {
        sessionId: string;
        userId: string;
        token: string;
        sessionExpiresAt: number;
        refreshTokenHash: string;
        refreshTokenExpiresAt: number;
      },
      void,
      string
    >;
  };
  users: {
    getUserById: FunctionReference<
      "query",
      "public" | "internal",
      { userId: string },
      NativeUserDoc | null,
      string
    >;
    getUserByEmail: FunctionReference<
      "query",
      "public" | "internal",
      { email: string },
      NativeUserDoc | null,
      string
    >;
  };
  accounts: {
    createAccount: FunctionReference<
      "mutation",
      "public" | "internal",
      {
        userId: string;
        provider: string;
        issuer: string;
        subject: string;
        credentialHash: string;
      },
      string,
      string
    >;
    getAccountBySubject: FunctionReference<
      "query",
      "public" | "internal",
      { provider: string; issuer: string; subject: string },
      NativeAccountDoc | null,
      string
    >;
  };
  identities: {
    createIdentity: FunctionReference<
      "mutation",
      "public" | "internal",
      {
        userId: string;
        provider: string;
        issuer: string;
        subject: string;
        tokenIdentifier: string;
        email?: string;
        emailVerified: boolean;
        sessionId?: string | null;
      },
      string,
      string
    >;
    getNativeIdentityByUser: FunctionReference<
      "query",
      "public" | "internal",
      { userId: string; provider: string; issuer: string },
      NativeIdentityDoc | null,
      string
    >;
  };
};

export function nativeAnonymous(
  component: NativeAnonymousComponentHandle,
  config: NativeAnonymousConfig | undefined,
) {
  if (!config) {
    throw new Error(
      "nativeAnonymous called without config; only call this when convexAuth.anonymous is configured.",
    );
  }
  const resolvedConfig = config;

  const emailDomain = resolvedConfig.emailDomain ?? "convex-auth.anonymous";

  async function createSession(
    ctx: GenericActionCtx<DataModel>,
    userId: string,
    identityId: string,
    rememberMe: boolean | undefined,
  ): Promise<{ sessionId: string; token: string; refreshToken: string }> {
    const now = Date.now();
    const sessionTtlMs = resolvedConfig.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    const refreshTokenTtlMs = resolvedConfig.refreshTokenTtlMs ?? DEFAULT_REFRESH_TOKEN_TTL_MS;
    const effectiveSessionTtlMs =
      rememberMe === false ? DONT_REMEMBER_SESSION_TTL_MS : sessionTtlMs;
    const sessionId = crypto.randomUUID();
    const refreshToken = generateVerificationToken();
    const refreshTokenHash = await hashToken(refreshToken);
    const expiresAt = now + effectiveSessionTtlMs;
    const token = await mintToken(
      userId,
      sessionId,
      { identityId },
      { expiresInSeconds: Math.floor(effectiveSessionTtlMs / 1000) },
    );
    await ctx.runMutation(component.sessions.createSessionAndRefreshToken, {
      sessionId,
      userId,
      token,
      sessionExpiresAt: expiresAt,
      refreshTokenHash,
      refreshTokenExpiresAt: now + refreshTokenTtlMs,
    });
    return { sessionId, token, refreshToken };
  }

  const signInAnonymous = action({
    args: { rememberMe: v.optional(v.boolean()) },
    returns: v.any(),
    handler: async (ctx, args): Promise<NativeAuthSession> => {
      const anonymousId = crypto.randomUUID();
      const email = `${anonymousId}@${emailDomain}`.toLowerCase();
      const name =
        (await Promise.resolve(
          resolvedConfig.generateName ? resolvedConfig.generateName() : undefined,
        )) ?? `Guest ${anonymousId.slice(0, 8)}`;

      const { userId, identityId } = await ctx.runMutation(
        component.anonymous.createAnonymousUser,
        {
          email,
          name,
        },
      );

      const { sessionId, token, refreshToken } = await createSession(
        ctx,
        userId,
        identityId,
        args.rememberMe,
      );

      const user = await ctx.runQuery(component.users.getUserById, { userId });
      if (!user) {
        throw new Error("Anonymous user was not created");
      }

      return {
        token,
        refreshToken,
        user: toNativeAuthUser(user as NativeUserDoc),
        userId,
        identityId,
        sessionId,
      };
    },
  });

  const linkAnonymousAccount = action({
    args: {
      email: v.string(),
      password: v.string(),
      name: v.optional(v.string()),
      image: v.optional(v.string()),
    },
    returns: v.any(),
    handler: async (ctx, args): Promise<NativeAuthSession> => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new Error("UNAUTHORIZED");
      }

      const anonymousUser = await ctx.runQuery(component.users.getUserById, {
        userId: identity.subject,
      });
      if (!anonymousUser) {
        throw new Error("Anonymous user not found");
      }

      if (!(anonymousUser as { isAnonymous?: boolean }).isAnonymous) {
        throw new Error("User is not an anonymous account");
      }

      const normalizedEmail = args.email.toLowerCase().trim();
      const existing = await ctx.runQuery(component.users.getUserByEmail, {
        email: normalizedEmail,
      });
      if (existing) {
        throw new Error("An account with this email already exists");
      }

      const existingAccount = await ctx.runQuery(component.accounts.getAccountBySubject, {
        provider: "email",
        issuer: "native",
        subject: normalizedEmail,
      });
      if (existingAccount) {
        throw new Error("An account with this email already exists");
      }

      const userId = identity.subject;
      const passwordHash = await hashPassword(args.password);

      await ctx.runMutation(component.anonymous.linkAnonymousUser, {
        userId,
        email: normalizedEmail,
        name: args.name,
        image: args.image,
      });

      await ctx.runMutation(component.accounts.createAccount, {
        userId,
        provider: "email",
        issuer: "native",
        subject: normalizedEmail,
        credentialHash: passwordHash,
      });

      const newIdentityId = await ctx.runMutation(component.identities.createIdentity, {
        userId,
        provider: "email",
        issuer: "native",
        subject: normalizedEmail,
        tokenIdentifier: normalizedEmail,
        email: normalizedEmail,
        emailVerified: false,
        sessionId: null,
      });

      const { sessionId, token, refreshToken } = await createSession(
        ctx,
        userId,
        newIdentityId,
        undefined,
      );

      const newUser = await ctx.runQuery(component.users.getUserById, { userId });

      if (resolvedConfig.onLinkAccount) {
        await resolvedConfig.onLinkAccount(
          {
            anonymousUser: toNativeAuthUser(anonymousUser as NativeUserDoc),
            newUser: toNativeAuthUser(newUser as NativeUserDoc),
          },
          ctx as unknown as GenericActionCtx<GenericDataModel>,
        );
      }

      return {
        token,
        refreshToken,
        user: toNativeAuthUser(newUser as NativeUserDoc),
        userId,
        identityId: newIdentityId,
        sessionId,
      };
    },
  });

  return { signInAnonymous, linkAnonymousAccount };
}
