import { action, mutation, query } from "../../component/_generated/server.js";
import { v } from "convex/values";
import type { GenericId } from "convex/values";
import type {
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  FunctionReference,
} from "convex/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";

export type NativePasskeyConfig = {
  rpID: string;
  /** Accepted origin(s) — a single origin or every origin the app is served from. */
  origin: string | string[];
  rpName?: string;
  /** Maximum active passkeys per user. Defaults to 10. */
  maxPasskeysPerUser?: number;
  /** Session JWT lifetime for passkey sign-ins. Defaults to 7 days. */
  sessionTtlMs?: number;
  /** Refresh token lifetime for passkey sign-ins. Defaults to 30 days. */
  refreshTokenTtlMs?: number;
  /** Attestation conveyance. Defaults to "none". */
  attestationType?: "none" | "direct" | "enterprise";
  /**
   * User-verification policy. When "required" (the default), verification
   * enforces UV; set "preferred" or "discouraged" explicitly to let
   * authenticators that skip UV through.
   */
  userVerification?: "required" | "preferred" | "discouraged";
  authenticatorAttachment?: "platform" | "cross-platform";
  residentKey?: "required" | "preferred" | "discouraged";
};

export type PasskeyComponentApi = {
  generatePasskeyRegistrationOptions: FunctionReference<"mutation", "public" | "internal">;
  verifyPasskeyRegistration: FunctionReference<"mutation", "public" | "internal">;
  generatePasskeyAuthenticationOptions: FunctionReference<"mutation", "public" | "internal">;
  verifyPasskeyAuthentication: FunctionReference<"mutation", "public" | "internal">;
  listPasskeys: FunctionReference<"query", "public" | "internal">;
  revokePasskey: FunctionReference<"mutation", "public" | "internal">;
  renamePasskey: FunctionReference<"mutation", "public" | "internal">;
};

// The authenticated user's id, or throw. `argUserId`, when provided by a
// caller, must match the identity — never the other way around.
async function requireUserId(
  ctx: { auth: { getUserIdentity(): Promise<{ subject: string } | null> } },
  argUserId?: string,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  const userId = identity.subject;
  if (argUserId && argUserId !== userId) {
    throw new Error("Passkey operations can only target the signed-in user");
  }
  return userId;
}

export function nativePasskey(component: PasskeyComponentApi, config: NativePasskeyConfig) {
  const rpID = config.rpID;
  const origin = config.origin;
  const rpName = config.rpName ?? "Convex Auth";
  const maxPasskeys = config.maxPasskeysPerUser;
  const sessionTtlMs = config.sessionTtlMs;
  const refreshTokenTtlMs = config.refreshTokenTtlMs;
  // Default to enforcing UV — matching the behavior before this was
  // configurable. Only an explicit "preferred"/"discouraged" relaxes it.
  const requireUserVerification = (config.userVerification ?? "required") === "required";
  const userVerification = config.userVerification ?? "required";

  const getPasskeyRegistrationOptions = action({
    args: {
      userId: v.optional(v.string()),
      identifier: v.string(),
      displayName: v.optional(v.string()),
    },
    returns: v.record(v.string(), v.any()),
    handler: async (
      ctx: GenericActionCtx<any>,
      args: {
        userId?: string;
        identifier: string;
        displayName?: string;
      },
    ) => {
      const userId = await requireUserId(ctx, args.userId);
      return await ctx.runMutation(component.generatePasskeyRegistrationOptions, {
        userId: userId as unknown as GenericId<"users">,
        identifier: args.identifier,
        displayName: args.displayName,
        rpName,
        rpID,
        origin,
        userVerification,
        authenticatorAttachment: config.authenticatorAttachment,
        residentKey: config.residentKey,
        attestationType: config.attestationType,
        maxPasskeys,
      });
    },
  });

  const verifyPasskeyRegistration = action({
    args: {
      userId: v.optional(v.string()),
      identifier: v.string(),
      challenge: v.string(),
      response: v.any(),
      name: v.optional(v.string()),
    },
    returns: v.object({
      userId: v.string(),
      credentialId: v.string(),
    }),
    handler: async (
      ctx: GenericActionCtx<any>,
      args: {
        userId?: string;
        identifier: string;
        challenge: string;
        response: RegistrationResponseJSON;
        name?: string;
      },
    ) => {
      const userId = await requireUserId(ctx, args.userId);
      // Origin/rpID always come from server config — never from the client.
      return await ctx.runMutation(component.verifyPasskeyRegistration, {
        userId: userId as unknown as GenericId<"users">,
        identifier: args.identifier,
        challenge: args.challenge,
        response: args.response,
        rpID,
        origin,
        name: args.name,
        requireUserVerification,
        maxPasskeys,
      });
    },
  });

  const getPasskeyAuthenticationOptions = action({
    args: {
      userId: v.optional(v.string()),
      credentialId: v.optional(v.string()),
    },
    returns: v.record(v.string(), v.any()),
    handler: async (
      ctx: GenericActionCtx<any>,
      args: { userId?: string; credentialId?: string },
    ) => {
      // Credential ids are echoed back (allowCredentials) only when the caller
      // is authenticated as that user — unauthenticated callers get an empty
      // list, which is the discoverable-credential (usernameless) flow.
      const identity = await ctx.auth.getUserIdentity();
      return await ctx.runMutation(component.generatePasskeyAuthenticationOptions, {
        userId: args.userId as unknown as GenericId<"users"> | undefined,
        credentialId: args.credentialId,
        rpID,
        origin,
        userVerification,
        enumerateCredentials: !!args.userId && identity?.subject === args.userId,
      });
    },
  });

  const verifyPasskeyAuthentication = action({
    args: {
      challenge: v.string(),
      response: v.any(),
    },
    returns: v.object({
      token: v.optional(v.string()),
      refreshToken: v.optional(v.string()),
      userId: v.string(),
      identityId: v.optional(v.string()),
      sessionId: v.optional(v.string()),
      expiresAt: v.optional(v.number()),
      twoFactorRedirect: v.optional(v.boolean()),
      twoFactorChallengeToken: v.optional(v.string()),
      twoFactorMethods: v.optional(v.array(v.string())),
      twoFactorCookieMaxAgeMs: v.optional(v.number()),
    }),
    handler: async (
      ctx: GenericActionCtx<any>,
      args: {
        challenge: string;
        response: AuthenticationResponseJSON;
      },
    ) => {
      // Origin/rpID always come from server config — never from the client.
      return await ctx.runMutation(component.verifyPasskeyAuthentication, {
        challenge: args.challenge,
        response: args.response,
        rpID,
        origin,
        requireUserVerification,
        sessionTtlMs,
        refreshTokenTtlMs,
      });
    },
  });

  const listPasskeys = query({
    args: { userId: v.optional(v.string()) },
    returns: v.array(
      v.object({
        credentialId: v.string(),
        name: v.optional(v.string()),
        createdAt: v.number(),
        lastUsedAt: v.number(),
        revoked: v.boolean(),
      }),
    ),
    handler: async (ctx: GenericQueryCtx<any>, args: { userId?: string }) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        return [];
      }
      const userId = args.userId ?? identity.subject;
      if (userId !== identity.subject) {
        throw new Error("Cannot list another user's passkeys");
      }
      return await ctx.runQuery(component.listPasskeys, {
        userId: userId as unknown as GenericId<"users">,
      });
    },
  });

  const revokePasskey = mutation({
    args: { credentialId: v.string() },
    returns: v.object({ success: v.boolean() }),
    handler: async (ctx: GenericMutationCtx<any>, args: { credentialId: string }) => {
      const userId = await requireUserId(ctx);
      await ctx.runMutation(component.revokePasskey, {
        credentialId: args.credentialId,
        userId: userId as unknown as GenericId<"users">,
      });
      return { success: true };
    },
  });

  const renamePasskey = mutation({
    args: { credentialId: v.string(), name: v.string() },
    returns: v.object({ success: v.boolean() }),
    handler: async (ctx: GenericMutationCtx<any>, args: { credentialId: string; name: string }) => {
      const userId = await requireUserId(ctx);
      await ctx.runMutation(component.renamePasskey, {
        credentialId: args.credentialId,
        userId: userId as unknown as GenericId<"users">,
        name: args.name,
      });
      return { success: true };
    },
  });

  return {
    getPasskeyRegistrationOptions,
    verifyPasskeyRegistration,
    getPasskeyAuthenticationOptions,
    verifyPasskeyAuthentication,
    listPasskeys,
    revokePasskey,
    renamePasskey,
  };
}

export type NativePasskeyActions = ReturnType<typeof nativePasskey>;
