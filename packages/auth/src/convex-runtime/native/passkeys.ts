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
  origin: string;
  rpName?: string;
};

export type PasskeyComponentApi = {
  generatePasskeyRegistrationOptions: FunctionReference<"mutation", "public" | "internal">;
  verifyPasskeyRegistration: FunctionReference<"mutation", "public" | "internal">;
  generatePasskeyAuthenticationOptions: FunctionReference<"mutation", "public" | "internal">;
  verifyPasskeyAuthentication: FunctionReference<"mutation", "public" | "internal">;
  listPasskeys: FunctionReference<"query", "public" | "internal">;
  revokePasskey: FunctionReference<"mutation", "public" | "internal">;
};

export function nativePasskey(component: PasskeyComponentApi, config: NativePasskeyConfig) {
  const rpID = config.rpID;
  const origin = config.origin;
  const rpName = config.rpName ?? "Convex Auth";

  const getPasskeyRegistrationOptions = action({
    args: {
      userId: v.string(),
      identifier: v.string(),
      displayName: v.optional(v.string()),
      rpName: v.optional(v.string()),
      rpID: v.optional(v.string()),
    },
    returns: v.record(v.string(), v.any()),
    handler: async (
      ctx: GenericActionCtx<any>,
      args: {
        userId: string;
        identifier: string;
        displayName?: string;
        rpName?: string;
        rpID?: string;
      },
    ) => {
      return await ctx.runMutation(component.generatePasskeyRegistrationOptions, {
        userId: args.userId as unknown as GenericId<"users">,
        identifier: args.identifier,
        displayName: args.displayName,
        rpName: args.rpName ?? rpName,
        rpID: args.rpID ?? rpID,
      });
    },
  });

  const verifyPasskeyRegistration = action({
    args: {
      userId: v.string(),
      identifier: v.string(),
      challenge: v.string(),
      response: v.any(),
      name: v.optional(v.string()),
      rpID: v.optional(v.string()),
      origin: v.optional(v.string()),
    },
    returns: v.object({
      userId: v.string(),
      credentialId: v.string(),
    }),
    handler: async (
      ctx: GenericActionCtx<any>,
      args: {
        userId: string;
        identifier: string;
        challenge: string;
        response: RegistrationResponseJSON;
        name?: string;
        rpID?: string;
        origin?: string;
      },
    ) => {
      return await ctx.runMutation(component.verifyPasskeyRegistration, {
        userId: args.userId as unknown as GenericId<"users">,
        identifier: args.identifier,
        challenge: args.challenge,
        response: args.response,
        rpID: args.rpID ?? rpID,
        origin: args.origin ?? origin,
        name: args.name,
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
      });
    },
  });

  const verifyPasskeyAuthentication = action({
    args: {
      challenge: v.string(),
      response: v.any(),
      rpID: v.optional(v.string()),
      origin: v.optional(v.string()),
    },
    returns: v.object({
      token: v.string(),
      refreshToken: v.string(),
      userId: v.id("users"),
      identityId: v.optional(v.id("auth_identities")),
      sessionId: v.string(),
      expiresAt: v.number(),
    }),
    handler: async (
      ctx: GenericActionCtx<any>,
      args: {
        challenge: string;
        response: AuthenticationResponseJSON;
        rpID?: string;
        origin?: string;
      },
    ) => {
      return await ctx.runMutation(component.verifyPasskeyAuthentication, {
        challenge: args.challenge,
        response: args.response,
        rpID: args.rpID ?? rpID,
        origin: args.origin ?? origin,
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
      return await ctx.runQuery(component.listPasskeys, {
        userId: args.userId ? (args.userId as unknown as GenericId<"users">) : undefined,
      });
    },
  });

  const revokePasskey = mutation({
    args: { credentialId: v.string() },
    returns: v.object({ success: v.boolean() }),
    handler: async (ctx: GenericMutationCtx<any>, args: { credentialId: string }) => {
      await ctx.runMutation(component.revokePasskey, { credentialId: args.credentialId });
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
  };
}

export type NativePasskeyActions = ReturnType<typeof nativePasskey>;
