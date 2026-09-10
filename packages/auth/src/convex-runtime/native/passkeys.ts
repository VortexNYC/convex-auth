import { action } from "../../component/_generated/server.js";
import { v } from "convex/values";
import type { GenericActionCtx, FunctionReference } from "convex/server";
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
      userId: v.id("users"),
      identifier: v.string(),
      displayName: v.optional(v.string()),
    },
    returns: v.record(v.string(), v.any()),
    handler: async (
      ctx: GenericActionCtx<any>,
      args: { userId: string; identifier: string; displayName?: string },
    ) => {
      return await ctx.runMutation(component.generatePasskeyRegistrationOptions, {
        userId: args.userId,
        identifier: args.identifier,
        displayName: args.displayName,
        rpName,
        rpID,
      });
    },
  });

  const verifyPasskeyRegistration = action({
    args: {
      userId: v.id("users"),
      identifier: v.string(),
      challenge: v.string(),
      response: v.any(),
      name: v.optional(v.string()),
    },
    returns: v.object({
      userId: v.id("users"),
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
      },
    ) => {
      return await ctx.runMutation(component.verifyPasskeyRegistration, {
        userId: args.userId,
        identifier: args.identifier,
        challenge: args.challenge,
        response: args.response,
        rpID,
        origin,
        name: args.name,
      });
    },
  });

  const getPasskeyAuthenticationOptions = action({
    args: {
      userId: v.optional(v.id("users")),
      credentialId: v.optional(v.string()),
    },
    returns: v.record(v.string(), v.any()),
    handler: async (
      ctx: GenericActionCtx<any>,
      args: { userId?: string; credentialId?: string },
    ) => {
      return await ctx.runMutation(component.generatePasskeyAuthenticationOptions, {
        userId: args.userId,
        credentialId: args.credentialId,
        rpID,
      });
    },
  });

  const verifyPasskeyAuthentication = action({
    args: {
      challenge: v.string(),
      response: v.any(),
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
      args: { challenge: string; response: AuthenticationResponseJSON },
    ) => {
      return await ctx.runMutation(component.verifyPasskeyAuthentication, {
        challenge: args.challenge,
        response: args.response,
        rpID,
        origin,
      });
    },
  });

  return {
    getPasskeyRegistrationOptions,
    verifyPasskeyRegistration,
    getPasskeyAuthenticationOptions,
    verifyPasskeyAuthentication,
    listPasskeys: component.listPasskeys,
    revokePasskey: component.revokePasskey,
  };
}

export type NativePasskeyActions = ReturnType<typeof nativePasskey>;
