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
  /** Attestation conveyance. Defaults to "none". */
  attestationType?: "none" | "direct" | "enterprise";
  /**
   * User-verification policy. When "required", verification enforces UV; other
   * values let authenticators that skip UV through. Defaults to "preferred".
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
  const requireUserVerification = config.userVerification === "required";

  const getPasskeyRegistrationOptions = action({
    args: {
      userId: v.optional(v.string()),
      identifier: v.string(),
      displayName: v.optional(v.string()),
      rpName: v.optional(v.string()),
      rpID: v.optional(v.string()),
    },
    returns: v.record(v.string(), v.any()),
    handler: async (
      ctx: GenericActionCtx<any>,
      args: {
        userId?: string;
        identifier: string;
        displayName?: string;
        rpName?: string;
        rpID?: string;
      },
    ) => {
      const userId = await requireUserId(ctx, args.userId);
      return await ctx.runMutation(component.generatePasskeyRegistrationOptions, {
        userId: userId as unknown as GenericId<"users">,
        identifier: args.identifier,
        displayName: args.displayName,
        rpName: args.rpName ?? rpName,
        rpID: args.rpID ?? rpID,
        userVerification: config.userVerification,
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
      rpID: v.optional(v.string()),
      origin: v.optional(v.union(v.string(), v.array(v.string()))),
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
        rpID?: string;
        origin?: string | string[];
      },
    ) => {
      const userId = await requireUserId(ctx, args.userId);
      return await ctx.runMutation(component.verifyPasskeyRegistration, {
        userId: userId as unknown as GenericId<"users">,
        identifier: args.identifier,
        challenge: args.challenge,
        response: args.response,
        rpID: args.rpID ?? rpID,
        origin: args.origin ?? origin,
        name: args.name,
        requireUserVerification,
      });
    },
  });

  const getPasskeyAuthenticationOptions = action({
    args: {
      userId: v.optional(v.string()),
      credentialId: v.optional(v.string()),
      rpID: v.optional(v.string()),
    },
    returns: v.record(v.string(), v.any()),
    handler: async (
      ctx: GenericActionCtx<any>,
      args: { userId?: string; credentialId?: string; rpID?: string },
    ) => {
      return await ctx.runMutation(component.generatePasskeyAuthenticationOptions, {
        userId: args.userId as unknown as GenericId<"users"> | undefined,
        credentialId: args.credentialId,
        rpID: args.rpID ?? rpID,
        userVerification: config.userVerification,
      });
    },
  });

  const verifyPasskeyAuthentication = action({
    args: {
      challenge: v.string(),
      response: v.any(),
      rpID: v.optional(v.string()),
      origin: v.optional(v.union(v.string(), v.array(v.string()))),
    },
    returns: v.object({
      token: v.string(),
      refreshToken: v.string(),
      userId: v.string(),
      identityId: v.optional(v.string()),
      sessionId: v.string(),
      expiresAt: v.number(),
    }),
    handler: async (
      ctx: GenericActionCtx<any>,
      args: {
        challenge: string;
        response: AuthenticationResponseJSON;
        rpID?: string;
        origin?: string | string[];
      },
    ) => {
      return await ctx.runMutation(component.verifyPasskeyAuthentication, {
        challenge: args.challenge,
        response: args.response,
        rpID: args.rpID ?? rpID,
        origin: args.origin ?? origin,
        requireUserVerification,
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
